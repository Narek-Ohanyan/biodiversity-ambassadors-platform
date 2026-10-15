-- The programme is closed: no new registrations, and nobody else can qualify as an ambassador.
--
-- 1. Registration: settings.registration_closed = 'true' makes inserts into auth.users fail ('registration_closed'),
--    so the sign-up API is shut at the source, not just hidden in the UI. Existing accounts keep working
--    (log in, edit the profile, reset a password). To create an account anyway (e.g. a new manager), set
--    `select set_config('app.allow_signup', '1', true)` in the same transaction, or flip the setting.
-- 2. Qualification: the claim deadline (settings.system_deadline) is moved to now, which already locks every
--    claim/quiz/check-in. On top of that, `qualified` is frozen: once the system is locked, an ambassador is
--    qualified only if they were at the moment of closing (qualified_frozen). Credits approved or changed after
--    that can no longer tip anyone over. Publication, role eligibility and statuses all follow `qualified`.
--    Reopening is just moving system_deadline forward again (and setting registration_closed to 'false').

create table public.qualified_frozen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  frozen_at timestamptz not null default now()
);
alter table public.qualified_frozen enable row level security;
revoke all on public.qualified_frozen from anon, authenticated;

create or replace function private.progress_for(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cats jsonb := '{}'; total int := 0; req_total int := 0; r record; ap int; pe int;
  wreq int; bonus int; wpend int; attended boolean; excused boolean; watched boolean; done boolean;
  q boolean;
begin
  for r in select key, required from public.categories where key <> 'webinar' loop
    select coalesce(sum(credits) filter (where status = 'approved'), 0),
           coalesce(sum(credits) filter (where status = 'pending'), 0)
      into ap, pe from public.claims where user_id = uid and category = r.key;
    cats := cats || jsonb_build_object(r.key, jsonb_build_object(
      'required', r.required, 'earned', least(ap, r.required), 'pending', pe,
      'complete', ap >= r.required, 'full', ap + pe >= r.required));
    total := total + least(ap, r.required);
    req_total := req_total + r.required;
  end loop;

  select required into wreq from public.categories where key = 'webinar';
  select coalesce(sum(credits) filter (where status = 'approved'), 0),
         coalesce(sum(credits) filter (where status = 'pending'), 0)
    into bonus, wpend from public.claims where user_id = uid and category = 'webinar';
  bonus := least(bonus, wreq);
  attended := exists (select 1 from public.claims where user_id = uid and activity_key = 'webinar' and status = 'approved');
  select coalesce(bool_or(w.excused), false), coalesce(bool_or(w.recording_watched_at is not null), false)
    into excused, watched from public.webinar_attendance w where w.user_id = uid;
  done := attended or excused or watched;
  cats := cats || jsonb_build_object('webinar', jsonb_build_object(
    'required', wreq, 'earned', bonus, 'pending', wpend, 'complete', done, 'full', done,
    'attended', attended, 'excused', excused, 'watched', watched, 'priority', bonus > 0));

  -- once the programme is closed, qualification is whatever it was at that moment
  q := case when private.is_locked() then exists (select 1 from public.qualified_frozen where user_id = uid)
            else total >= req_total and done end;

  return jsonb_build_object('categories', cats, 'total', total + bonus, 'base_total', total, 'required', req_total,
    'qualified', q);
end $$;

create or replace function private.block_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select value from public.settings where key = 'registration_closed'), 'false') = 'true'
     and coalesce(current_setting('app.allow_signup', true), '') <> '1' then
    raise exception 'registration_closed';
  end if;
  return new;
end $$;
create trigger block_signup before insert on auth.users
  for each row execute function private.block_signup();

-- Snapshot who is qualified right now (with the deadline temporarily out of reach so the live rule is used),
-- then close.
update public.settings set value = '2099-12-31T23:59:59+00:00' where key = 'system_deadline';
-- Anyone already published stays qualified too: three ambassadors were published (60 credits) before the webinar
-- became mandatory and have not completed it; closing must not silently un-publish them.
insert into public.qualified_frozen (user_id)
  select a.id from public.accounts a
  where a.role = 'ambassador' and ((private.progress_for(a.id)->>'qualified')::boolean
        or exists (select 1 from public.publications p where p.user_id = a.id))
  on conflict do nothing;
update public.settings set value = to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"') where key = 'system_deadline';
insert into public.settings (key, value) values ('registration_closed', 'true')
  on conflict (key) do update set value = excluded.value;
