-- Volunteer roles are open to qualified ambassadors only (60 credits + the webinar attended or excused).
-- Enforced when signing up; anyone already enrolled stays enrolled (the manager can still remove them).

create or replace function private.roles_for(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.role, jsonb_build_object(
    'deadline', c.deadline, 'meeting_at', c.meeting_at,
    'open', now() <= c.deadline,
    'eligible', coalesce((private.progress_for(uid)->>'qualified')::boolean, false),
    'signed_up', s.user_id is not null, 'signed_up_at', s.created_at,
    'zoom_url', case when s.user_id is not null then c.zoom_url end)), '{}')
  from public.role_config c left join public.role_signups s on s.role = c.role and s.user_id = uid;
$$;

create or replace function public.signup_role(p_role text) returns jsonb
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
    if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
    if now() > cfg.deadline then raise exception 'role_closed'; end if;
    insert into public.role_signups (user_id, role) values (uid, p_role);
  end if;
  return private.roles_for(uid);
end $$;

create or replace function public.manager_role_signups(p_role text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'config', (select to_jsonb(c) - 'zoom_url' from public.role_config c where c.role = p_role),
    'rows', (select coalesce(jsonb_agg(x order by x->>'created_at'), '[]') from (
      select jsonb_build_object('id', a.id, 'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name,
        'university', p.university, 'faculty', p.faculty, 'created_at', s.created_at,
        'qualified', coalesce((private.progress_for(a.id)->>'qualified')::boolean, false)) as x
      from public.role_signups s
      join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id
      where s.role = p_role) t));
end $$;
