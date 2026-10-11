-- Webinar recording: ambassadors who missed the live session meet the mandatory webinar requirement by
-- watching the recording. Zoom gives us no way to verify viewing, so this is open-then-confirm: the
-- recording must be opened from the platform before the "I have watched it" confirmation is accepted.
-- Only live check-in/out earns the 10 credits (and Priority); the recording only satisfies the requirement.
-- The share link lives in a client-inaccessible table and is returned only to signed-in ambassadors.

create table public.webinar_config (
  id boolean primary key default true check (id),
  recording_url text not null
);
alter table public.webinar_config enable row level security;
revoke all on public.webinar_config from anon, authenticated;
insert into public.webinar_config (recording_url)
  values ('https://us02web.zoom.us/rec/share/rc8S8eukOcKqLIYizej-dnxkfqTbZtK95-irkvInTdofwsXX1AVTUQFY928NNw.GWXXJg3u7q4vGOZN');

alter table public.webinar_attendance
  add column recording_opened_at timestamptz,
  add column recording_watched_at timestamptz;

create or replace function private.progress_for(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cats jsonb := '{}'; total int := 0; req_total int := 0; r record; ap int; pe int;
  wreq int; bonus int; wpend int; attended boolean; excused boolean; watched boolean; done boolean;
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

  return jsonb_build_object('categories', cats, 'total', total + bonus, 'base_total', total, 'required', req_total,
    'qualified', total >= req_total and done);
end $$;

create or replace function private.webinar_status(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'checkin_open', coalesce((select value from public.settings where key = 'webinar_checkin_open'), 'false') = 'true',
    'checkout_open', coalesce((select value from public.settings where key = 'webinar_checkout_open'), 'false') = 'true',
    'checked_in_at', w.checked_in_at, 'checked_out_at', w.checked_out_at,
    'excused', coalesce(w.excused, false),
    'done', exists (select 1 from public.claims c where c.user_id = uid and c.activity_key = 'webinar' and c.status = 'approved'),
    'bonus', exists (select 1 from public.claims c where c.user_id = uid and c.activity_key = 'webinar' and c.status = 'approved' and c.category = 'webinar'),
    'recording_url', (select recording_url from public.webinar_config),
    'recording_opened', w.recording_opened_at is not null,
    'recording_watched', w.recording_watched_at is not null)
  from (select 1) s left join public.webinar_attendance w on w.user_id = uid;
$$;

create function public.webinar_open_recording() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  perform private.webinar_guard(uid);
  insert into public.webinar_attendance (user_id, recording_opened_at) values (uid, now())
    on conflict (user_id) do update set recording_opened_at = coalesce(public.webinar_attendance.recording_opened_at, now());
  return private.webinar_status(uid);
end $$;

create function public.webinar_confirm_recording() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  perform private.webinar_guard(uid);
  update public.webinar_attendance set recording_watched_at = coalesce(recording_watched_at, now())
    where user_id = uid and recording_opened_at is not null;
  if not found then raise exception 'recording_not_opened'; end if;
  perform private.sync_publication(uid);
  return private.webinar_status(uid);
end $$;

create or replace function public.manager_webinar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'checkin_open', coalesce((select value from public.settings where key = 'webinar_checkin_open'), 'false') = 'true',
    'checkout_open', coalesce((select value from public.settings where key = 'webinar_checkout_open'), 'false') = 'true',
    'rows', (select coalesce(jsonb_agg(x), '[]') from (
      select jsonb_build_object(
        'id', a.id, 'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university,
        'checked_in_at', w.checked_in_at, 'checked_out_at', w.checked_out_at, 'excused', coalesce(w.excused, false),
        'watched', w.recording_watched_at is not null, 'watched_at', w.recording_watched_at,
        'done', exists (select 1 from public.claims c where c.user_id = a.id and c.activity_key = 'webinar' and c.status = 'approved'),
        'priority', exists (select 1 from public.claims c where c.user_id = a.id and c.activity_key = 'webinar'
                            and c.status = 'approved' and c.category = 'webinar')) as x
      from public.accounts a
      left join public.profiles p on p.user_id = a.id
      left join public.webinar_attendance w on w.user_id = a.id
      where a.role = 'ambassador') t));
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.webinar_open_recording()', 'public.webinar_confirm_recording()'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
