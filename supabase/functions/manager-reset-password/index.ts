// Manager-only: set a new password for an ambassador. If none is supplied a random one is generated
// and returned once so the manager can pass it on.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function generatePassword(len = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: me } = await admin.from("accounts").select("role").eq("id", user.id).single();
    if (me?.role !== "manager") return json({ error: "forbidden" }, 403);

    const { user_id, password } = await req.json();
    const { data: target } = await admin.from("accounts").select("role").eq("id", user_id).maybeSingle();
    if (!target || target.role !== "ambassador") return json({ error: "not_found" }, 404);
    if (password !== undefined && password !== null && password !== "" && String(password).length < 8) {
      return json({ error: "password_too_short" }, 400);
    }
    const next = password ? String(password) : generatePassword();
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: next });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, password: password ? undefined : next });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
