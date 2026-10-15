-- COP17 volunteer teams. The single "Rapporteur" role grows into ten teams (Media, Event Coordination, Rapporteurs
-- (Green Zone), Content Development, Daily Recap, Rapporteurs (Blue Zones) = the existing `rapporteur` role, Green
-- Zone Guides, Promoters, Coordinators, AUCB Pavilion Volunteer Coordinators).
--
--  * Applying is open-ended (no limit on applicants). A manager approves applications by hand, and only up to the
--    team's capacity; ambassadors see "applied" and "approved / capacity". Ambassadors may apply to several teams.
--  * Applications now have a status: pending (default; everyone already on the Rapporteur list becomes pending),
--    approved, rejected. Qualified-only still applies to signing up.
--  * Ambassadors plan their own schedule on a calendar (12 days x hourly slots, one team per slot); managers see
--    each person's calendar and a summary of who is engaged when, to spot uncovered hours.
--  * The Rapporteur teams keep the mandatory training recording; other teams have none (recording_url null).
-- Team names/descriptions live in the client (bilingual); the database holds what must be enforced: capacity,
-- minimum hours per day (shown as a check, not blocking), applications and shifts.

alter table public.role_config
  add column capacity int check (capacity is null or capacity > 0),
  add column min_hours int check (min_hours is null or min_hours between 1 and 14),
  add column sort int not null default 0;

update public.role_config set sort = 6 where role = 'rapporteur';   -- Rapporteurs (Blue Zones): capacity still TBD
insert into public.role_config (role, deadline, meeting_at, recording_url, capacity, min_hours, sort)
select v.role, null, null, v.rec, v.cap, v.hrs, v.sort
from (values
  ('media', null::text, 30, 2, 1),
  ('event_coordination', null, 25, 3, 2),
  ('rapporteur_green', (select recording_url from public.role_config where role = 'rapporteur'), 30, null, 3),
  ('content_dev', null, 20, 1, 4),
  ('daily_recap', null, 25, null, 5),
  ('green_guides', null, 30, 2, 7),
  ('promoters', null, 25, 3, 8),
  ('coordinators', null, 10, 8, 9),
  ('pavilion_coordinators', null, 10, 4, 10)
) as v(role, rec, cap, hrs, sort);

alter table public.role_signups
  add column status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  add column decided_at timestamptz;

-- ── shifts (the calendar) ─────────────────────────────────────────────────────
-- One row per hour a person plans to work, tagged with the team. Deleting an application deletes its shifts.
create table public.role_shifts (
  user_id uuid not null,
  day date not null check (day between date '2026-10-19' and date '2026-10-30'),
  hour smallint not null check (hour between 8 and 21),   -- the slot starting at this hour (08:00-22:00)
  role text not null,
  primary key (user_id, day, hour),
  foreign key (user_id, role) references public.role_signups (user_id, role) on delete cascade
);
alter table public.role_shifts enable row level security;
revoke all on public.role_shifts from anon, authenticated;

-- ── what an ambassador sees ───────────────────────────────────────────────────
create or replace function private.roles_for(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with e as (select coalesce((private.progress_for(uid)->>'qualified')::boolean, false) as ok)
  select coalesce(jsonb_object_agg(c.role, jsonb_build_object(
    'capacity', c.capacity, 'min_hours', c.min_hours, 'sort', c.sort,
    'applied', (select count(*) from public.role_signups x where x.role = c.role and x.status in ('pending', 'approved')),
    'approved', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'approved'),
    'open', c.deadline is null or now() <= c.deadline,
    'eligible', e.ok,
    'status', s.status,
    'signed_up', coalesce(s.status in ('pending', 'approved'), false), 'signed_up_at', s.created_at,
    'needs_recording', c.recording_url is not null,
    'recording_url', case when s.status in ('pending', 'approved') then c.recording_url end,
    'recording_opened', s.recording_opened_at is not null,
    'recording_watched', s.recording_watched_at is not null)), '{}')
  from public.role_config c cross join e
  left join public.role_signups s on s.role = c.role and s.user_id = uid;
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
  -- an existing application (whatever its status) is left as it is; a rejected one cannot be re-filed
  if not exists (select 1 from public.role_signups where user_id = uid and role = p_role) then
    if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
    if cfg.deadline is not null and now() > cfg.deadline then raise exception 'role_closed'; end if;
    insert into public.role_signups (user_id, role) values (uid, p_role);
  end if;
  return private.roles_for(uid);
end $$;

create or replace function public.role_open_recording(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.role_signups set recording_opened_at = coalesce(recording_opened_at, now())
    where user_id = uid and role = p_role and status in ('pending', 'approved');
  if not found then raise exception 'not_signed_up'; end if;
  return private.roles_for(uid);
end $$;

create or replace function public.role_confirm_recording(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.role_signups where user_id = uid and role = p_role and status in ('pending', 'approved')) then raise exception 'not_signed_up'; end if;
  update public.role_signups set recording_watched_at = coalesce(recording_watched_at, now())
    where user_id = uid and role = p_role and recording_opened_at is not null;
  if not found then raise exception 'recording_not_opened'; end if;
  return private.roles_for(uid);
end $$;

-- ── the calendar (ambassador) ─────────────────────────────────────────────────
create function public.my_shifts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'hour', hour, 'role', role) order by day, hour), '[]')
  from public.role_shifts where user_id = (select auth.uid());
$$;

-- Applies a batch of slot changes: [{day:'2026-10-20', hour:9, role:'media'}, {day:..., hour:..., role:null} (= clear)].
create function public.set_my_shifts(p_changes jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); ch jsonb; d date; h int; r text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 500 then raise exception 'invalid_request'; end if;
  for ch in select * from jsonb_array_elements(p_changes) loop
    d := (ch->>'day')::date; h := (ch->>'hour')::int; r := nullif(ch->>'role', '');
    if d not between date '2026-10-19' and date '2026-10-30' or h not between 8 and 21 then raise exception 'invalid_shift'; end if;
    if r is null then
      delete from public.role_shifts where user_id = uid and day = d and hour = h;
    else
      if not exists (select 1 from public.role_signups where user_id = uid and role = r and status in ('pending', 'approved')) then raise exception 'not_signed_up'; end if;
      insert into public.role_shifts (user_id, day, hour, role) values (uid, d, h, r)
        on conflict (user_id, day, hour) do update set role = excluded.role;
    end if;
  end loop;
  return true;
end $$;

-- ── manager: applications and calendars ───────────────────────────────────────
create function public.manager_roles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(jsonb_build_object(
        'role', c.role, 'capacity', c.capacity, 'min_hours', c.min_hours, 'sort', c.sort, 'needs_recording', c.recording_url is not null,
        'pending', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'pending'),
        'approved', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'approved'),
        'rejected', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'rejected')) order by c.sort), '[]')
      from public.role_config c),
    'rows', (select coalesce(jsonb_agg(x order by x->>'created_at'), '[]') from (
      select jsonb_build_object('id', a.id, 'email', a.email, 'role', s.role, 'status', s.status,
        'first_name', p.first_name, 'last_name', p.last_name, 'first_name_en', p.first_name_en, 'last_name_en', p.last_name_en,
        'university', p.university, 'faculty', p.faculty, 'created_at', s.created_at,
        'watched', s.recording_watched_at is not null, 'watched_at', s.recording_watched_at,
        'hours', (select count(*) from public.role_shifts sh where sh.user_id = s.user_id and sh.role = s.role),
        'qualified', coalesce((private.progress_for(a.id)->>'qualified')::boolean, false)) as x
      from public.role_signups s
      join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id) t));
end $$;

create function public.decide_role_signup(p_user uuid, p_role text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.role_signups; cap int;
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'invalid_status'; end if;
  select * into s from public.role_signups where user_id = p_user and role = p_role for update;
  if not found then raise exception 'not_found'; end if;
  if p_status = 'approved' and s.status <> 'approved' then
    select capacity into cap from public.role_config where role = p_role;
    if cap is not null and (select count(*) from public.role_signups where role = p_role and status = 'approved') >= cap then
      raise exception 'role_full';
    end if;
  end if;
  update public.role_signups set status = p_status, decided_at = case when p_status = 'pending' then null else now() end
    where user_id = p_user and role = p_role;
  if p_status = 'rejected' then delete from public.role_shifts where user_id = p_user and role = p_role; end if;
  if p_status in ('approved', 'rejected') and s.status is distinct from p_status then
    perform private.notify(p_user, 'role_' || p_status, jsonb_build_object('role', p_role));
  end if;
end $$;

-- Every planned slot of every applicant (compact: the client builds the individual and summary calendars from this).
create function public.manager_shifts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('u', sh.user_id, 'd', sh.day, 'h', sh.hour, 'r', sh.role, 's', su.status))
    from public.role_shifts sh join public.role_signups su on su.user_id = sh.user_id and su.role = sh.role), '[]');
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.my_shifts()', 'public.set_my_shifts(jsonb)', 'public.manager_roles()',
                            'public.decide_role_signup(uuid, text, text)', 'public.manager_shifts()'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
