-- BioBlitz claims are now decided automatically at submission time against the attendance roster,
-- instead of sitting pending for a manager to review — there is no proof to look at (no certificate,
-- no check-in sheet), so the roster match is the entire decision.
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

create or replace function public.manager_claims(p_status text default null) returns jsonb
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
      'checkin', case when c.activity_key = 'inperson' then private.checkin_status(c.id) end,
      'bioblitz', case when c.activity_key = 'bioblitz' then private.bioblitz_status(c.id) end)) as x
    from public.claims c
    join public.accounts a on a.id = c.user_id
    join public.activities act on act.key = c.activity_key
    left join public.profiles p on p.user_id = c.user_id
    where (p_status is null or c.status = p_status)
    order by c.created_at desc limit 1000) t);
end $$;
