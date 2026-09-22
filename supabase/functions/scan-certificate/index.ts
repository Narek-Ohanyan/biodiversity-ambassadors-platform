// Automatic certificate scan. Reads the certificate (PDF text layer; images via Claude vision when
// ANTHROPIC_API_KEY is set as a function secret) and checks that
//   1. the ambassador's name (or account e-mail) appears, and
//   2. at least one keyword of the course appears.
// The verdict is advisory: the manager always sees the file and makes the final call.
//   valid | review | invalid | unreadable
// The model is only used to transcribe text; its output is string-matched, never used to decide anything.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (s: string) =>
  String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}\s@.]/gu, " ").replace(/\s+/g, " ").trim();

async function transcribe(bytes: Uint8Array, mime: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return "";
  const isPdf = mime === "application/pdf";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: [
          { type: isPdf ? "document" : "image", source: { type: "base64", media_type: mime, data: encodeBase64(bytes) } },
          { type: "text", text: "Transcribe all text visible in this document exactly as written. Output only the transcription." },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  const data = await res.json();
  return (data.content || []).map((c: { text?: string }) => c.text || "").join("\n");
}

async function textOf(bytes: Uint8Array, mime: string): Promise<string> {
  let text = "";
  if (mime === "application/pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } catch { /* fall through to vision */ }
  }
  if (norm(text).length < 15) text = await transcribe(bytes, mime);
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { claim_id } = await req.json();
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: claim } = await admin.from("claims").select("*").eq("id", claim_id).maybeSingle();
    if (!claim) return json({ error: "not_found" }, 404);
    const { data: me } = await admin.from("accounts").select("role").eq("id", user.id).single();
    const isManager = me?.role === "manager";
    if (claim.user_id !== user.id && !isManager) return json({ error: "forbidden" }, 403);
    // Owners can only trigger the first scan; re-scans are for the manager.
    if (!isManager && claim.scan?.verdict !== "scanning") return json({ ok: true, skipped: true });

    const { data: act } = await admin.from("activities").select("*").eq("key", claim.activity_key).single();
    if (act.kind !== "certificate") return json({ ok: true, skipped: true });
    const { data: files } = await admin.from("claim_files").select("*").eq("claim_id", claim.id);
    const { data: prof } = await admin.from("profiles").select("first_name,last_name").eq("user_id", claim.user_id).maybeSingle();
    const { data: acct } = await admin.from("accounts").select("email").eq("id", claim.user_id).single();

    const rank: Record<string, number> = { valid: 3, review: 2, invalid: 1, unreadable: 0 };
    let best: Record<string, unknown> | null = null;
    for (const f of files ?? []) {
      let result: Record<string, unknown>;
      try {
        const { data: blob, error } = await admin.storage.from("certificates").download(f.path);
        if (error || !blob) throw new Error(error?.message ?? "download failed");
        const text = await textOf(new Uint8Array(await blob.arrayBuffer()), f.mime || "application/pdf");
        const hay = norm(text);
        const tokens = [norm(prof?.first_name ?? ""), norm(prof?.last_name ?? "")].filter(Boolean);
        const nameMatch = tokens.length === 2 && tokens.every((t) => hay.includes(t));
        const emailMatch = !!acct?.email && hay.includes(norm(acct.email));
        const kws: string[] = act.keywords ?? [];
        const found = kws.filter((k) => hay.includes(norm(k)));
        const courseMatch = kws.length ? found.length > 0 : true;
        let verdict = "invalid";
        if (hay.length < 15) verdict = "unreadable";
        else if ((nameMatch || emailMatch) && courseMatch) verdict = "valid";
        else if (nameMatch || emailMatch || (kws.length && courseMatch)) verdict = "review";
        result = { verdict, nameMatch, emailMatch, courseMatch, keywords: found, chars: hay.length };
        if (verdict === "unreadable" && !Deno.env.get("ANTHROPIC_API_KEY") && f.mime !== "application/pdf") {
          result.note = "image_needs_manual_review";
        }
      } catch (e) {
        result = { verdict: "unreadable", note: `scan failed: ${(e as Error).message}` };
      }
      if (!best || rank[result.verdict as string] > rank[best.verdict as string]) best = result;
    }
    const scan = { ...(best ?? { verdict: "unreadable", note: "no file" }), scannedAt: new Date().toISOString() };
    await admin.from("claims").update({ scan }).eq("id", claim.id);
    return json({ ok: true, scan });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
