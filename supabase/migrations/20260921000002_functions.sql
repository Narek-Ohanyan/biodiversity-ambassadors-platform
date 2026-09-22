-- Business logic. Every mutation goes through one of these SECURITY DEFINER functions.

-- ── private helpers ──────────────────────────────────────────────────────────
create function private.is_locked() returns boolean
language sql stable set search_path = '' as $$
  select now() > (select value from public.settings where key = 'system_deadline')::timestamptz;
$$;

create function private.notify(uid uuid, ntype text, nparams jsonb default '{}', npopup boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, params, popup) values (uid, ntype, coalesce(nparams, '{}'), npopup);
$$;

create function private.notify_managers(ntype text, nparams jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, params)
  select id, ntype, coalesce(nparams, '{}') from public.accounts where role = 'manager';
$$;

-- Approved credits count towards a category (capped at its requirement). Pending credits are tracked so a
-- category "closes" as soon as approved + pending reach the requirement: nobody can queue credits they do not need.
create function private.progress_for(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cats jsonb := '{}'; total int := 0; req_total int := 0; r record; ap int; pe int;
begin
  for r in select key, required from public.categories loop
    select coalesce(sum(credits) filter (where status = 'approved'), 0),
           coalesce(sum(credits) filter (where status = 'pending'), 0)
      into ap, pe from public.claims where user_id = uid and category = r.key;
    cats := cats || jsonb_build_object(r.key, jsonb_build_object(
      'required', r.required, 'earned', least(ap, r.required), 'pending', pe,
      'complete', ap >= r.required, 'full', ap + pe >= r.required));
    total := total + least(ap, r.required);
    req_total := req_total + r.required;
  end loop;
  return jsonb_build_object('categories', cats, 'total', total, 'required', req_total, 'qualified', total >= req_total);
end $$;

create function private.status_of(uid uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare done boolean; prog jsonb;
begin
  select completed into done from public.profiles where user_id = uid;
  if not coalesce(done, false) then return 'profile_incomplete'; end if;
  prog := private.progress_for(uid);
  if (prog->>'qualified')::boolean then return 'qualified'; end if;
  if (prog->>'total')::int > 0 then return 'in_progress'; end if;
  return 'started';
end $$;

-- Publishes an ambassador on the public page once all three requirements are met (and withdraws them if not).
create function private.sync_publication(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare prog jsonb := private.progress_for(uid); prof public.profiles; nm text;
begin
  select * into prof from public.profiles where user_id = uid;
  if (prog->>'qualified')::boolean and prof.completed then
    if not exists (select 1 from public.publications where user_id = uid) then
      insert into public.publications (user_id) values (uid);
      nm := btrim(coalesce(prof.first_name, '') || ' ' || coalesce(prof.last_name, ''));
      perform private.notify(uid, 'qualified', '{}', true);
      perform private.notify_managers('qualified_manager', jsonb_build_object('name', nm, 'user_id', uid));
    end if;
  elsif not (prog->>'qualified')::boolean then
    delete from public.publications where user_id = uid;
  end if;
end $$;

create function private.audience_ids(aud jsonb) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.accounts a left join public.profiles p on p.user_id = a.id
  where a.role = 'ambassador' and (
       aud->>'mode' = 'all'
    or (aud->>'mode' = 'university' and p.university = aud->>'university')
    or (aud->>'mode' = 'status' and private.status_of(a.id) = aud->>'status')
    or (aud->>'mode' = 'selected' and a.id in (select (jsonb_array_elements_text(aud->'ids'))::uuid))
  );
$$;

create function private.checkin_status(claim bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.claims; emails text[]; names text[]; hits jsonb; by_email boolean; total int;
begin
  select * into c from public.claims where id = claim;
  emails := array_remove(array[
    nullif(lower(btrim(c.form->>'email')), ''),
    (select nullif(lower(email), '') from public.accounts where id = c.user_id)], null);
  names := array_remove(array[
    nullif(private.norm_name(c.form->>'full_name'), ''),
    (select nullif(private.norm_name(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
       from public.profiles where user_id = c.user_id)], null);
  select count(*) into total from public.checkin_records;
  select coalesce(jsonb_agg(jsonb_build_object('file', b.filename, 'by',
           case when r.email_norm = any(emails) then 'email' else 'name' end, 'data', r.raw)), '[]'),
         coalesce(bool_or(r.email_norm = any(emails)), false)
    into hits, by_email
  from public.checkin_records r join public.checkin_batches b on b.id = r.batch_id
  where r.email_norm = any(emails) or r.name_norm = any(names);
  return jsonb_build_object('dataset_loaded', total > 0, 'verified', jsonb_array_length(hits) > 0,
    'matched_by', case when jsonb_array_length(hits) = 0 then null when by_email then 'email' else 'name' end,
    'rows', hits);
end $$;

-- ── ambassador API ───────────────────────────────────────────────────────────
create function public.my_progress() returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.progress_for((select auth.uid()));
$$;

create function public.record_login() returns void
language sql security definer set search_path = '' as $$
  update public.accounts set last_seen_at = now() where id = (select auth.uid());
$$;

create function public.submit_claim(p_activity text, p_form jsonb, p_files jsonb default '[]')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  act public.activities; prof public.profiles; prog jsonb;
  cleaned jsonb := '{}'; new_id bigint; f jsonb; nfiles int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if private.is_locked() then raise exception 'deadline_passed'; end if;
  select * into act from public.activities where key = p_activity;
  if not found or act.kind = 'portal' then raise exception 'invalid_activity'; end if;
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

-- UNICEF modules live in the platform. Finishing the last one awards the credits automatically.
create function public.set_unicef_module(p_module text, p_done boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid()); act public.activities; prof public.profiles;
  done_n int; total_n int; ap int; remaining int; creds int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if private.is_locked() then raise exception 'deadline_passed'; end if;
  if not exists (select 1 from public.unicef_modules where id = p_module) then raise exception 'invalid_module'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found or not prof.completed then raise exception 'profile_incomplete'; end if;
  select * into act from public.activities where key = 'unicef';

  if exists (select 1 from public.claims where user_id = uid and activity_key = 'unicef' and status in ('pending','approved')) then
    raise exception 'already_claimed';
  end if;

  if p_done then
    if (private.progress_for(uid)->'categories'->act.category->>'full')::boolean then raise exception 'category_full'; end if;
    insert into public.unicef_progress (user_id, module_id) values (uid, p_module) on conflict do nothing;
  else
    delete from public.unicef_progress where user_id = uid and module_id = p_module;
  end if;

  select count(*) into done_n from public.unicef_progress where user_id = uid;
  select count(*) into total_n from public.unicef_modules;

  if p_done and done_n >= total_n then
    select coalesce(sum(credits), 0) into ap from public.claims where user_id = uid and category = act.category and status = 'approved';
    remaining := (select required from public.categories where key = act.category) - ap;
    creds := least(act.credits, greatest(remaining, 0));
    if creds > 0 then
      insert into public.claims (user_id, activity_key, category, status, credits, auto, decided_at)
      values (uid, act.key, act.category, 'approved', creds, true, now());
      perform private.notify(uid, 'claim_approved', jsonb_build_object('activity', act.key, 'credits', creds, 'auto', true));
      perform private.sync_publication(uid);
    end if;
  end if;
  return jsonb_build_object('done', done_n, 'total', total_n);
end $$;

create function public.mark_read(p_ids bigint[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any(p_ids));
$$;

create function public.mark_popups_seen(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set popup_seen_at = now(), read_at = coalesce(read_at, now())
  where user_id = (select auth.uid()) and id = any(p_ids);
$$;

-- ── public API ───────────────────────────────────────────────────────────────
create function public.public_ambassadors() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.user_id, 'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university,
    'faculty', p.faculty, 'bio', p.bio, 'skills', p.skills, 'languages', p.languages, 'social', p.social,
    'public_email', p.public_email, 'photo_path', p.photo_path, 'published_at', pub.published_at)
    order by pub.published_at desc), '[]')
  from public.publications pub join public.profiles p on p.user_id = pub.user_id where p.completed;
$$;

create function public.submit_contact(p_name text, p_email text, p_subject text, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  p_name := btrim(coalesce(p_name, '')); p_email := btrim(coalesce(p_email, ''));
  p_subject := btrim(coalesce(p_subject, '')); p_message := btrim(coalesce(p_message, ''));
  if p_name = '' or length(p_name) > 120 or length(p_email) > 200 or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or length(p_subject) > 200 or p_message = '' or length(p_message) > 5000 then
    raise exception 'invalid_form';
  end if;
  if (select count(*) from public.contact_messages where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.contact_messages where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.contact_messages (name, email, subject, message) values (p_name, p_email, nullif(p_subject, ''), p_message);
  perform private.notify_managers('contact_message', jsonb_build_object('name', p_name));
end $$;

-- ── manager API ──────────────────────────────────────────────────────────────
create function public.decide_claim(p_claim bigint, p_decision text, p_credits int default null, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.claims; act public.activities; approved_other int; remaining int; creds int; cat_required int;
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision'; end if;
  select * into c from public.claims where id = p_claim for update;
  if not found then raise exception 'not_found'; end if;
  if c.status = p_decision then raise exception 'no_change'; end if;
  select * into act from public.activities where key = c.activity_key;
  creds := c.credits;

  if p_decision = 'approved' then
    select required into cat_required from public.categories where key = c.category;
    select coalesce(sum(credits), 0) into approved_other from public.claims
      where user_id = c.user_id and category = c.category and status = 'approved' and id <> c.id;
    remaining := cat_required - approved_other;
    if remaining <= 0 then raise exception 'category_complete'; end if;
    creds := case when act.is_other then greatest(1, least(coalesce(p_credits, act.credits), act.credits)) else act.credits end;
    creds := least(creds, remaining);
  end if;

  update public.claims set status = p_decision, credits = creds, manager_comment = nullif(btrim(coalesce(p_comment, '')), ''),
         decided_at = now() where id = p_claim;
  perform private.notify(c.user_id, case p_decision when 'approved' then 'claim_approved' else 'claim_rejected' end,
    jsonb_build_object('activity', c.activity_key, 'credits', creds, 'comment', nullif(btrim(coalesce(p_comment, '')), '')));
  perform private.sync_publication(c.user_id);
  return jsonb_build_object('status', p_decision, 'credits', creds);
end $$;

create function public.manager_ambassadors() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') from (
    select jsonb_build_object(
      'id', a.id, 'email', a.email, 'created_at', a.created_at, 'last_seen_at', a.last_seen_at,
      'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university, 'faculty', p.faculty,
      'photo_path', p.photo_path, 'completed', coalesce(p.completed, false),
      'progress', private.progress_for(a.id), 'status', private.status_of(a.id),
      'published_at', pub.published_at) as x
    from public.accounts a
    left join public.profiles p on p.user_id = a.id
    left join public.publications pub on pub.user_id = a.id
    where a.role = 'ambassador') t);
end $$;

create function public.manager_ambassador(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'account', (select to_jsonb(a) from public.accounts a where a.id = p_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = p_id),
    'progress', private.progress_for(p_id),
    'claims', (select coalesce(jsonb_agg(to_jsonb(c) - 'form' - 'scan' order by c.created_at desc), '[]')
               from public.claims c where c.user_id = p_id));
end $$;

create function public.manager_claims(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(x order by (x->>'status' = 'pending') desc, x->>'created_at' desc), '[]') from (
    select (to_jsonb(c) || jsonb_build_object(
      'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university,
      'kind', act.kind, 'is_other', act.is_other, 'default_credits', act.credits,
      'files', coalesce((select jsonb_agg(to_jsonb(f)) from public.claim_files f where f.claim_id = c.id), '[]'),
      'duplicate_files', exists (
        select 1 from public.claim_files f join public.claim_files g on g.sha256 = f.sha256 and g.claim_id <> f.claim_id
        join public.claims c2 on c2.id = g.claim_id and c2.user_id <> c.user_id where f.claim_id = c.id and f.sha256 is not null),
      'checkin', case when c.activity_key = 'inperson' then private.checkin_status(c.id) end)) as x
    from public.claims c
    join public.accounts a on a.id = c.user_id
    join public.activities act on act.key = c.activity_key
    left join public.profiles p on p.user_id = c.user_id
    where (p_status is null or c.status = p_status)
    order by c.created_at desc limit 1000) t);
end $$;

create function public.manager_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'ambassadors', (select count(*) from public.accounts where role = 'ambassador'),
    'profiles_complete', (select count(*) from public.profiles p join public.accounts a on a.id = p.user_id where p.completed and a.role = 'ambassador'),
    'published', (select count(*) from public.publications),
    'pending_claims', (select count(*) from public.claims where status = 'pending'),
    'approved_claims', (select count(*) from public.claims where status = 'approved'),
    'unread_contact', (select count(*) from public.contact_messages where read_at is null),
    'by_status', (select coalesce(jsonb_object_agg(s, n), '{}') from (
      select private.status_of(id) s, count(*) n from public.accounts where role = 'ambassador' group by 1) q));
end $$;

create function public.audience_count(p_audience jsonb) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return (select count(*) from private.audience_ids(p_audience));
end $$;

create function public.send_announcement(p_title_en text, p_title_hy text, p_body_en text, p_body_hy text, p_audience jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; ann_id bigint;
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  p_title_en := btrim(coalesce(p_title_en, '')); p_title_hy := btrim(coalesce(p_title_hy, ''));
  p_body_en := btrim(coalesce(p_body_en, '')); p_body_hy := btrim(coalesce(p_body_hy, ''));
  if (p_title_en = '' and p_title_hy = '') or (p_body_en = '' and p_body_hy = '')
     or length(p_title_en) > 200 or length(p_title_hy) > 200 or length(p_body_en) > 4000 or length(p_body_hy) > 4000 then
    raise exception 'invalid_form';
  end if;
  select count(*) into n from private.audience_ids(p_audience);
  if n = 0 then raise exception 'no_recipients'; end if;
  insert into public.announcements (sender, title_en, title_hy, body_en, body_hy, audience, recipients)
  values ((select auth.uid()), nullif(p_title_en, ''), nullif(p_title_hy, ''), nullif(p_body_en, ''), nullif(p_body_hy, ''), p_audience, n)
  returning id into ann_id;
  insert into public.notifications (user_id, type, params, popup)
  select id, 'announcement', jsonb_build_object('announcement_id', ann_id, 'title_en', nullif(p_title_en, ''),
    'title_hy', nullif(p_title_hy, ''), 'body_en', nullif(p_body_en, ''), 'body_hy', nullif(p_body_hy, '')), true
  from private.audience_ids(p_audience) id;
  return n;
end $$;

create function public.mark_contact_read(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  update public.contact_messages set read_at = now() where id = p_id;
end $$;

-- ── function privileges ──────────────────────────────────────────────────────
do $$
declare fn text;
begin
  for fn in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
grant execute on function public.public_ambassadors() to anon;
grant execute on function public.submit_contact(text, text, text, text) to anon;

-- Internal helpers are only ever called from the SECURITY DEFINER functions above.
revoke all on function private.notify(uuid, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function private.notify_managers(text, jsonb) from public, anon, authenticated;
revoke all on function private.progress_for(uuid) from public, anon, authenticated;
revoke all on function private.status_of(uuid) from public, anon, authenticated;
revoke all on function private.sync_publication(uuid) from public, anon, authenticated;
revoke all on function private.audience_ids(jsonb) from public, anon, authenticated;
revoke all on function private.checkin_status(bigint) from public, anon, authenticated;
