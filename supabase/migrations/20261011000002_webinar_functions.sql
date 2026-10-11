-- Webinar RPCs: ambassador check-in/out, manager open/close + excuse, and keeping the generic claim
-- path from being used to claim the webinar without attending.

create function public.my_webinar_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.webinar_status((select auth.uid()));
$$;

create function private.webinar_guard(uid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare prof public.profiles;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if private.is_locked() then raise exception 'deadline_passed'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found or not prof.completed then raise exception 'profile_incomplete'; end if;
end $$;
revoke all on function private.webinar_guard(uuid) from public, anon, authenticated;

create function public.webinar_check_in() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  perform private.webinar_guard(uid);
  if exists (select 1 from public.webinar_attendance where user_id = uid and checked_in_at is not null) then
    return private.webinar_status(uid);
  end if;
  if coalesce((select value from public.settings where key = 'webinar_checkin_open'), 'false') <> 'true' then
    raise exception 'checkin_closed';
  end if;
  insert into public.webinar_attendance (user_id, checked_in_at) values (uid, now())
    on conflict (user_id) do update set checked_in_at = coalesce(public.webinar_attendance.checked_in_at, now());
  return private.webinar_status(uid);
end $$;

-- Checking out completes attendance and awards the 10 credits: under Elective while the ambassador has
-- fewer than 10 approved elective credits, otherwise under the Webinar category as a bonus (+ Priority).
create function public.webinar_check_out() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid()); w public.webinar_attendance; act public.activities;
  elective_req int; elective_ap int; as_bonus boolean; note text;
begin
  perform private.webinar_guard(uid);
  select * into w from public.webinar_attendance where user_id = uid for update;
  if not found or w.checked_in_at is null then raise exception 'not_checked_in'; end if;
  if w.checked_out_at is not null then return private.webinar_status(uid); end if;
  if coalesce((select value from public.settings where key = 'webinar_checkout_open'), 'false') <> 'true' then
    raise exception 'checkout_closed';
  end if;
  update public.webinar_attendance set checked_out_at = now() where user_id = uid;

  if not exists (select 1 from public.claims where user_id = uid and activity_key = 'webinar' and status in ('pending', 'approved')) then
    select * into act from public.activities where key = 'webinar';
    select required into elective_req from public.categories where key = 'elective';
    select coalesce(sum(credits), 0) into elective_ap from public.claims
      where user_id = uid and category = 'elective' and status = 'approved';
    as_bonus := elective_ap >= elective_req;
    note := case when as_bonus then 'Բոնուս կրեդիտներ և առաջնահերթություն / Bonus credits and Priority'
                 else 'Հաշվարկվել է որպես ընտրովի կրեդիտ / Counted as Elective credits' end;
    insert into public.claims (user_id, activity_key, category, status, credits, auto, decided_at)
    values (uid, 'webinar', case when as_bonus then 'webinar' else 'elective' end, 'approved', act.credits, true, now());
    perform private.notify(uid, 'claim_approved', jsonb_build_object('activity', 'webinar', 'credits', act.credits, 'auto', true, 'comment', note));
    perform private.sync_publication(uid);
  end if;
  return private.webinar_status(uid);
end $$;

create function public.set_webinar_window(p_checkin boolean default null, p_checkout boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  if p_checkin is not null then
    insert into public.settings (key, value) values ('webinar_checkin_open', p_checkin::text)
      on conflict (key) do update set value = excluded.value;
  end if;
  if p_checkout is not null then
    insert into public.settings (key, value) values ('webinar_checkout_open', p_checkout::text)
      on conflict (key) do update set value = excluded.value;
  end if;
  return jsonb_build_object(
    'checkin_open', (select value from public.settings where key = 'webinar_checkin_open') = 'true',
    'checkout_open', (select value from public.settings where key = 'webinar_checkout_open') = 'true');
end $$;

create function public.manager_webinar() returns jsonb
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
        'done', exists (select 1 from public.claims c where c.user_id = a.id and c.activity_key = 'webinar' and c.status = 'approved'),
        'priority', exists (select 1 from public.claims c where c.user_id = a.id and c.activity_key = 'webinar'
                            and c.status = 'approved' and c.category = 'webinar')) as x
      from public.accounts a
      left join public.profiles p on p.user_id = a.id
      left join public.webinar_attendance w on w.user_id = a.id
      where a.role = 'ambassador') t));
end $$;

create function public.excuse_webinar(p_user uuid, p_excused boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.accounts where id = p_user and role = 'ambassador') then raise exception 'not_found'; end if;
  insert into public.webinar_attendance (user_id, excused, excused_at)
    values (p_user, p_excused, case when p_excused then now() end)
    on conflict (user_id) do update set excused = excluded.excused, excused_at = excluded.excused_at;
  if p_excused then perform private.notify(p_user, 'webinar_excused'); end if;
  perform private.sync_publication(p_user);
  return private.webinar_status(p_user);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.my_webinar_status()', 'public.webinar_check_in()', 'public.webinar_check_out()',
    'public.set_webinar_window(boolean, boolean)', 'public.manager_webinar()', 'public.excuse_webinar(uuid, boolean)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- The webinar is claimed only by checking in and out, never through the generic claim path.
create or replace function public.submit_claim(p_activity text, p_form jsonb, p_files jsonb default '[]')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  act public.activities; prof public.profiles; prog jsonb;
  cleaned jsonb := '{}'; new_id bigint; f jsonb; nfiles int;
  bmatched boolean; bcredits int; cat_required int; approved_other int; note text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if private.is_locked() then raise exception 'deadline_passed'; end if;
  select * into act from public.activities where key = p_activity;
  if not found or act.kind in ('portal', 'webinar') then raise exception 'invalid_activity'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found or not prof.completed then raise exception 'profile_incomplete'; end if;

  prog := private.progress_for(uid);
  if (prog->'categories'->act.category->>'full')::boolean then raise exception 'category_full'; end if;
  if not act.is_other and exists (
       select 1 from public.claims where user_id = uid and activity_key = act.key and status in ('pending','approved')) then
    raise exception 'already_claimed';
  end if;

  p_form := coalesce(p_form, '{}');
  p_files := coalesce(p_files, '[]');
  if jsonb_typeof(p_files) <> 'array' then raise exception 'invalid_files'; end if;
  nfiles := jsonb_array_length(p_files);
  if nfiles > 5 then raise exception 'too_many_files'; end if;

  if act.kind = 'checkin' then
    if btrim(coalesce(p_form->>'full_name', '')) = '' or btrim(coalesce(p_form->>'email', '')) = ''
       or btrim(coalesce(p_form->>'university', '')) = '' or coalesce(p_form->>'checkin_confirmed', '') <> 'true' then
      raise exception 'invalid_form';
    end if;
    cleaned := jsonb_build_object('full_name', left(btrim(p_form->>'full_name'), 200),
      'email', left(btrim(p_form->>'email'), 200), 'university', left(btrim(p_form->>'university'), 200),
      'checkin_confirmed', true);
  elsif act.kind = 'form' then
    if btrim(coalesce(p_form->>'project_name', '')) = '' or length(p_form->>'project_name') > 200
       or private.word_count(p_form->>'description') < 100 or length(coalesce(p_form->>'description', '')) > 8000
       or (p_form->>'date_from')::date is null or (p_form->>'date_to')::date is null
       or (p_form->>'date_to')::date < (p_form->>'date_from')::date then
      raise exception 'invalid_form';
    end if;
    cleaned := jsonb_build_object('project_name', btrim(p_form->>'project_name'),
      'date_from', p_form->>'date_from', 'date_to', p_form->>'date_to', 'description', btrim(p_form->>'description'));
  end if;

  if act.kind in ('certificate', 'form') and nfiles < 1 then raise exception 'file_required'; end if;
  for f in select * from jsonb_array_elements(p_files) loop
    if left(coalesce(f->>'path', ''), length(uid::text) + 1) <> uid::text || '/' or (f->>'path') like '%..%' then
      raise exception 'invalid_files';
    end if;
  end loop;

  if act.key = 'bioblitz' then
    bmatched := private.bioblitz_match(uid);
    select required into cat_required from public.categories where key = act.category;
    select coalesce(sum(credits), 0) into approved_other from public.claims
      where user_id = uid and category = act.category and status = 'approved';
    bcredits := case when bmatched then least(act.credits, greatest(cat_required - approved_other, 0)) else 0 end;
    note := 'Ձեր անունը հայտնաբերված չէ BioBlitz-ի մասնակիցների հաստատված ցանկում։ / Not found on the confirmed BioBlitz attendance list.';

    insert into public.claims (user_id, activity_key, category, credits, form, status, auto, manager_comment, decided_at)
    values (uid, act.key, act.category, bcredits, cleaned, case when bmatched then 'approved' else 'rejected' end,
            true, case when bmatched then null else note end, now())
    returning id into new_id;

    perform private.notify(uid, case when bmatched then 'claim_approved' else 'claim_rejected' end,
      jsonb_build_object('activity', act.key, 'credits', bcredits, 'auto', true, 'comment', case when bmatched then null else note end));
    if bmatched then perform private.sync_publication(uid); end if;
    return new_id;
  end if;

  insert into public.claims (user_id, activity_key, category, credits, form, scan)
  values (uid, act.key, act.category, act.credits, cleaned,
          case when act.kind = 'certificate' then '{"verdict":"scanning"}'::jsonb end)
  returning id into new_id;

  insert into public.claim_files (claim_id, path, original_name, mime, size, sha256)
  select new_id, x->>'path', left(coalesce(x->>'name', 'file'), 200), x->>'mime', (x->>'size')::bigint, x->>'sha256'
  from jsonb_array_elements(p_files) x;

  perform private.notify_managers('claim_submitted', jsonb_build_object(
    'claim_id', new_id, 'activity', act.key,
    'name', btrim(coalesce(prof.first_name, '') || ' ' || coalesce(prof.last_name, ''))));
  return new_id;
end $$;
