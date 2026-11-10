-- Per-user exception to the closed claim period. The deadline (settings.system_deadline) and the frozen qualified
-- list stay global; a user listed in claim_unlocked_users can still submit claims, take quizzes and so on, and earns
-- qualification by credits as before (on top of the frozen list). Used for the owner's test profile.
-- To unlock someone:  insert into public.claim_unlocked_users (user_id) values ('<uuid>');
create table public.claim_unlocked_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.claim_unlocked_users enable row level security;
revoke all on public.claim_unlocked_users from anon, authenticated;

-- the global state of the claim period
create function private.is_locked_global() returns boolean
language sql stable security definer set search_path = '' as $$
  select now() > (select value from public.settings where key = 'system_deadline')::timestamptz;
$$;

-- what the claim/quiz/check-in functions test: locked for everyone except unlocked users
create or replace function private.is_locked() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_locked_global()
    and not exists (select 1 from public.claim_unlocked_users where user_id = (select auth.uid()));
$$;

create or replace function private.progress_for(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cats jsonb := '{}'; total int := 0; req_total int := 0; r record; ap int; pe int;
  wreq int; bonus int; wpend int; attended boolean; excused boolean; watched boolean; done boolean;
  q boolean; unl boolean := exists (select 1 from public.claim_unlocked_users where user_id = uid);
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

  -- once the programme is closed, qualification is what it was at closing (frozen list) — or, for an unlocked user, earned by credits
  q := case when private.is_locked_global()
            then exists (select 1 from public.qualified_frozen where user_id = uid) or (unl and total >= req_total and done)
            else total >= req_total and done end;

  return jsonb_build_object('categories', cats, 'total', total + bonus, 'base_total', total, 'required', req_total,
    'qualified', q, 'unlocked', unl);
end $$;

insert into public.claim_unlocked_users (user_id) values ('37773ddb-290e-4cc3-839d-a22b320d1b67') on conflict do nothing;
