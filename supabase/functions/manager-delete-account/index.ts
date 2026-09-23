// Manager-only: permanently delete an ambassador's account. Deleting the auth user cascades to
// every row that references it (profile, claims, claim files, notifications, UNICEF progress) via
// the "on delete cascade" foreign keys in the schema.
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

    const { user_id } = await req.json();
    if (user_id === user.id) return json({ error: "cannot_delete_self" }, 400);
    const { data: target } = await admin.from("accounts").select("role").eq("id", user_id).maybeSingle();
    if (!target || target.role !== "ambassador") return json({ error: "not_found" }, 404);

    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
