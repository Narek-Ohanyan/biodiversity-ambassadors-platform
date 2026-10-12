-- Rapporteur sign-up no longer closes, and the live Zoom meeting is replaced by a recording that every
-- signed-up ambassador must watch. A role's deadline is now optional (NULL = always open) and the meeting
-- time/link are gone; instead each role has a recording_url. As with the webinar recording, Zoom gives no
-- way to verify viewing, so it is open-then-confirm: the recording must be opened from the platform before
-- the "I have watched it" confirmation is accepted. The link stays in a client-inaccessible table and is
-- returned only to ambassadors who have signed up (sign-up is what shares their email with the team).

alter table public.role_config
  alter column deadline drop not null,
  alter column meeting_at drop not null,
  drop column zoom_url,
  add column recording_url text;

update public.role_config set
  deadline = null, meeting_at = null,
  recording_url = 'https://us02web.zoom.us/rec/share/7chiVLIJlMOz207IQ1v17bvQ8jyHo9dUSOpWIl7-GhULwLgxzrbpoT5iYA-itEJe.wWIabfwUHXP6de18'
  where role = 'rapporteur';

alter table public.role_signups
  add column recording_opened_at timestamptz,
  add column recording_watched_at timestamptz;

create or replace function private.roles_for(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.role, jsonb_build_object(
    'deadline', c.deadline, 'meeting_at', c.meeting_at,
    'open', c.deadline is null or now() <= c.deadline,
    'eligible', coalesce((private.progress_for(uid)->>'qualified')::boolean, false),
    'signed_up', s.user_id is not null, 'signed_up_at', s.created_at,
    'recording_url', case when s.user_id is not null then c.recording_url end,
    'recording_opened', s.recording_opened_at is not null,
    'recording_watched', s.recording_watched_at is not null)), '{}')
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
  if not exists (select 1 from public.role_signups where user_id = uid and role = p_role) then
    if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
    if cfg.deadline is not null and now() > cfg.deadline then raise exception 'role_closed'; end if;
    insert into public.role_signups (user_id, role) values (uid, p_role);
  end if;
  return private.roles_for(uid);
end $$;

create function public.role_open_recording(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.role_signups set recording_opened_at = coalesce(recording_opened_at, now())
    where user_id = uid and role = p_role;
  if not found then raise exception 'not_signed_up'; end if;
  return private.roles_for(uid);
end $$;

create function public.role_confirm_recording(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.role_signups where user_id = uid and role = p_role) then raise exception 'not_signed_up'; end if;
  update public.role_signups set recording_watched_at = coalesce(recording_watched_at, now())
    where user_id = uid and role = p_role and recording_opened_at is not null;
  if not found then raise exception 'recording_not_opened'; end if;
  return private.roles_for(uid);
end $$;

create or replace function public.manager_role_signups(p_role text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'config', (select to_jsonb(c) - 'recording_url' from public.role_config c where c.role = p_role),
    'rows', (select coalesce(jsonb_agg(x order by x->>'created_at'), '[]') from (
      select jsonb_build_object('id', a.id, 'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name,
        'university', p.university, 'faculty', p.faculty, 'created_at', s.created_at,
        'watched', s.recording_watched_at is not null, 'watched_at', s.recording_watched_at,
        'qualified', coalesce((private.progress_for(a.id)->>'qualified')::boolean, false)) as x
      from public.role_signups s
      join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id
      where s.role = p_role) t));
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.role_open_recording(text)', 'public.role_confirm_recording(text)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
