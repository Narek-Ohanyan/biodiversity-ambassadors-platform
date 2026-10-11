-- Volunteer roles ambassadors can sign up for (first one: Rapporteur). Signing up before the role's
-- deadline records the ambassador for the admin and reveals the meeting link. The link lives in a
-- table with no client access (the public `settings` table is world-readable), and is only ever
-- returned by my_roles()/signup_role() to ambassadors who have signed up.

create table public.role_config (
  role text primary key,
  deadline timestamptz not null,
  meeting_at timestamptz not null,
  zoom_url text not null
);
alter table public.role_config enable row level security;
revoke all on public.role_config from anon, authenticated;

insert into public.role_config (role, deadline, meeting_at, zoom_url) values
  ('rapporteur', '2026-10-12T16:50:00+04:00', '2026-10-12T17:00:00+04:00', 'https://us02web.zoom.us/j/82491576434');

create table public.role_signups (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null references public.role_config(role),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.role_signups enable row level security;
revoke all on public.role_signups from anon, authenticated;

create function private.roles_for(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.role, jsonb_build_object(
    'deadline', c.deadline, 'meeting_at', c.meeting_at,
    'open', now() <= c.deadline,
    'signed_up', s.user_id is not null, 'signed_up_at', s.created_at,
    'zoom_url', case when s.user_id is not null then c.zoom_url end)), '{}')
  from public.role_config c left join public.role_signups s on s.role = c.role and s.user_id = uid;
$$;
revoke all on function private.roles_for(uuid) from public, anon, authenticated;

create function public.my_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.roles_for((select auth.uid()));
$$;

create function public.signup_role(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); cfg public.role_config; prof public.profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  select * into cfg from public.role_config where role = p_role;
  if not found then raise exception 'invalid_role'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found or not prof.completed then raise exception 'profile_incomplete'; end if;
  -- already signed up: stay idempotent (and keep the meeting link available) even after the deadline
  if not exists (select 1 from public.role_signups where user_id = uid and role = p_role) then
    if now() > cfg.deadline then raise exception 'role_closed'; end if;
    insert into public.role_signups (user_id, role) values (uid, p_role);
  end if;
  return private.roles_for(uid);
end $$;

create function public.manager_role_signups(p_role text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'config', (select to_jsonb(c) - 'zoom_url' from public.role_config c where c.role = p_role),
    'rows', (select coalesce(jsonb_agg(x order by x->>'created_at'), '[]') from (
      select jsonb_build_object('id', a.id, 'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name,
        'university', p.university, 'faculty', p.faculty, 'created_at', s.created_at) as x
      from public.role_signups s
      join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id
      where s.role = p_role) t));
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.my_roles()', 'public.signup_role(text)', 'public.manager_role_signups(text)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
