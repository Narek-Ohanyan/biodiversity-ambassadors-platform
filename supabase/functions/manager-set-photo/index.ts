// Manager-only: store a new profile photo for an ambassador (e.g. when their upload was broken or unusable).
// The image must already be a reasonably small JPEG (downscale it first, as the site does for uploads). It is
// saved as a NEW object in the owner's folder (a fresh URL, so no stale CDN copy) and the path is returned;
// the caller then points the profile at it (the service role cannot write `profiles` itself — its validation
// trigger lives in the private schema):
//   update public.profiles set photo_path = '<new_path>', photo_pos_x = <x>, photo_pos_y = <y> where user_id = '<user_id>';
//
// Call (as a manager): functions.invoke('manager-set-photo', { body: { user_id, image_base64 } })
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { user_id, image_base64 } = await req.json();
    if (typeof user_id !== "string" || typeof image_base64 !== "string") return json({ error: "invalid_request" }, 400);
    const { data: prof } = await admin.from("profiles").select("user_id").eq("user_id", user_id).maybeSingle();
    if (!prof) return json({ error: "not_found" }, 404);

    const bytes = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));
    if (bytes.length > 1_500_000) return json({ error: "too_large" }, 400);
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return json({ error: "not_jpeg" }, 400);

    const newPath = `${user_id}/${Date.now()}.jpg`;
    const up = await admin.storage.from("photos").upload(newPath, bytes, { contentType: "image/jpeg", upsert: false });
    if (up.error) return json({ error: up.error.message }, 500);
    return json({ ok: true, new_path: newPath, bytes: bytes.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
