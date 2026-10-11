// Manager-only: write a rotated copy of an ambassador's stored profile photo (for photos uploaded sideways).
// Saves the rotated JPEG as a NEW object in the owner's folder (a fresh URL, so no stale CDN copy) and returns
// its path; the original file is kept and the caller points the profile at the new path (the service role
// cannot write `profiles` itself — its validation trigger lives in the private schema).
//
// Call (as a manager): functions.invoke('manager-rotate-photo', { body: { user_id, degrees: 90 | 180 | 270 } })
// `degrees` is the clockwise rotation to apply. Afterwards, in SQL:
//   update public.profiles set photo_path = '<new_path>', photo_pos_x = null, photo_pos_y = null where user_id = '<user_id>';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

    const { user_id, degrees } = await req.json();
    if (![90, 180, 270].includes(degrees)) return json({ error: "invalid_degrees" }, 400);
    const { data: prof } = await admin.from("profiles").select("photo_path").eq("user_id", user_id).maybeSingle();
    if (!prof?.photo_path) return json({ error: "not_found" }, 404);

    const dl = await admin.storage.from("photos").download(prof.photo_path);
    if (dl.error || !dl.data) return json({ error: "download_failed" }, 500);
    const img = await Image.decode(new Uint8Array(await dl.data.arrayBuffer()));
    const before = { w: img.width, h: img.height };
    // ImageScript rotates counter-clockwise for positive angles; `degrees` is clockwise.
    img.rotate(-degrees, true);
    const out = await img.encodeJPEG(90);

    const newPath = `${user_id}/${Date.now()}.jpg`;
    const up = await admin.storage.from("photos").upload(newPath, out, { contentType: "image/jpeg", upsert: false });
    if (up.error) return json({ error: up.error.message }, 500);
    return json({ ok: true, old_path: prof.photo_path, new_path: newPath, before, after: { w: img.width, h: img.height } });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
