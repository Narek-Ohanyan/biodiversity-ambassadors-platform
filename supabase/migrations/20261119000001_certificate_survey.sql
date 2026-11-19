-- Phase 1 wrap-up for qualified ambassadors:
--  1. The UNICEF course is a free library: every module and every video is unlocked for everybody.
--  2. "Claim your certificate": a required feedback survey (English or Armenian, one submission each), then the
--     ambassador gives their full name in Armenian and English and the client builds the certificate PDF from
--     the template. The names are stored (and shown to managers); they must match the profile name, and can be
--     corrected at most 3 times.

-- ── 1. UNICEF modules: nothing locked ────────────────────────────────────────
create or replace function public.my_unicef_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  done_modules text[];
  result jsonb := '[]';
  m record;
  is_done boolean; all_videos_done boolean;
  vlist jsonb; quiz jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(array_agg(module_id), '{}') into done_modules from public.unicef_progress where user_id = uid;

  for m in select * from public.unicef_modules order by sort loop
    is_done := m.id = any(done_modules);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', v.id, 'sort', v.sort, 'title_en', v.title_en, 'title_hy', v.title_hy,
             'dir', v.dir, 'filename', v.filename,
             'max_time', coalesce(vp.max_time, 0), 'duration', vp.duration,
             'completed', coalesce(vp.completed, false),
             'unlocked', true) order by v.sort), '[]')
      into vlist
    from public.unicef_videos v left join public.unicef_video_progress vp on vp.video_id = v.id and vp.user_id = uid
    where v.module_id = m.id;

    select bool_and(coalesce(vp.completed, false)) into all_videos_done
    from public.unicef_videos v left join public.unicef_video_progress vp on vp.video_id = v.id and vp.user_id = uid
    where v.module_id = m.id;

    select jsonb_build_object('attempted', true, 'score', qa.score, 'total', qa.total, 'passed', qa.passed)
      into quiz from public.unicef_quiz_attempts qa where qa.user_id = uid and qa.module_id = m.id;

    result := result || jsonb_build_object(
      'id', m.id, 'sort', m.sort, 'title_en', m.title_en, 'title_hy', m.title_hy,
      'unlocked', true, 'completed', is_done, 'all_videos_done', coalesce(all_videos_done, false),
      'videos', vlist, 'quiz', coalesce(quiz, jsonb_build_object('attempted', false)));
  end loop;
  return result;
end $$;

-- ── 2. survey + certificate ──────────────────────────────────────────────────
create table public.survey_responses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lang text not null check (lang in ('hy', 'en')),
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);
alter table public.survey_responses enable row level security;
revoke all on public.survey_responses from anon, authenticated;

create table public.certificates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name_hy text not null,
  full_name_en text not null,
  edits int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.certificates enable row level security;
revoke all on public.certificates from anon, authenticated;

-- Does a typed full name contain the profile's names? The first word of the first name and every word of the
-- last name must appear (so a middle name or a shortened double first name is fine). A blank profile name is not checked.
create function private.full_name_ok(typed text, first_name text, last_name text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare words text[]; f text; l text[];
  from_c text := 'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ'; to_c text := 'aaaaaaeeeeiiiiooooouuuuyycn'; -- accents are ignored
begin
  words := regexp_split_to_array(translate(lower(btrim(regexp_replace(coalesce(typed, ''), '[^[:alpha:]]+', ' ', 'g'))), from_c, to_c), ' ');
  f := (regexp_split_to_array(translate(lower(btrim(regexp_replace(coalesce(first_name, ''), '[^[:alpha:]]+', ' ', 'g'))), from_c, to_c), ' '))[1];
  l := regexp_split_to_array(translate(lower(btrim(regexp_replace(coalesce(last_name, ''), '[^[:alpha:]]+', ' ', 'g'))), from_c, to_c), ' ');
  if coalesce(f, '') <> '' and not (f = any(words)) then return false; end if;
  if coalesce(array_to_string(l, ''), '') <> '' and not (l <@ words) then return false; end if;
  return true;
end $$;

create function public.my_certificate() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); sv public.survey_responses; c public.certificates;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into sv from public.survey_responses where user_id = uid;
  select * into c from public.certificates where user_id = uid;
  return jsonb_build_object(
    'eligible', coalesce((private.progress_for(uid)->>'qualified')::boolean, false),
    'survey_done', sv.user_id is not null, 'survey_lang', sv.lang,
    'certificate', case when c.user_id is null then null else jsonb_build_object(
      'full_name_hy', c.full_name_hy, 'full_name_en', c.full_name_en, 'edits_left', greatest(0, 3 - c.edits)) end);
end $$;

-- One submission per ambassador. Required questions are enforced here (the client checks them too).
create function public.submit_survey(p_lang text, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); k text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
  if p_lang not in ('hy', 'en') or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 40000 then raise exception 'invalid_survey'; end if;
  if exists (select 1 from public.survey_responses where user_id = uid) then raise exception 'survey_done'; end if;
  foreach k in array array['a1', 'b5', 'b6', 'b7', 'd10', 'e12', 'e14'] loop
    if coalesce(p_answers->>k, '') = '' then raise exception 'invalid_survey'; end if;
  end loop;
  if jsonb_typeof(p_answers->'a2') <> 'object' or (select count(*) from jsonb_object_keys(p_answers->'a2')) < 4 then raise exception 'invalid_survey'; end if;
  insert into public.survey_responses (user_id, lang, answers) values (uid, p_lang, p_answers);
end $$;

create function public.set_certificate_names(p_hy text, p_en text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); hy text := regexp_replace(btrim(p_hy), '\s+', ' ', 'g'); en text := regexp_replace(btrim(p_en), '\s+', ' ', 'g');
  prof public.profiles; c public.certificates;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
  if not exists (select 1 from public.survey_responses where user_id = uid) then raise exception 'survey_required'; end if;
  if length(hy) not between 5 and 40 or length(en) not between 5 and 40
     or hy !~ '^[Ա-և]+([ ''’-][Ա-և]+)+$'
     or en !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]+([ ''’.-][A-Za-zÀ-ÖØ-öø-ÿ]+)+$' then raise exception 'invalid_name'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found then raise exception 'profile_incomplete'; end if;
  if not private.full_name_ok(hy, case when prof.first_name ~ '[Ա-և]' then prof.first_name else prof.first_name_hy end, case when prof.last_name ~ '[Ա-և]' then prof.last_name else prof.last_name_hy end)
     or not private.full_name_ok(en, case when prof.first_name !~ '[Ա-և]' then prof.first_name else prof.first_name_en end, case when prof.last_name !~ '[Ա-և]' then prof.last_name else prof.last_name_en end) then
    raise exception 'name_mismatch';
  end if;
  select * into c from public.certificates where user_id = uid;
  if not found then
    insert into public.certificates (user_id, full_name_hy, full_name_en) values (uid, hy, en) returning * into c;
  elsif c.full_name_hy <> hy or c.full_name_en <> en then
    if c.edits >= 3 then raise exception 'certificate_limit'; end if;
    update public.certificates set full_name_hy = hy, full_name_en = en, edits = edits + 1, updated_at = now() where user_id = uid returning * into c;
  end if;
  return jsonb_build_object('full_name_hy', c.full_name_hy, 'full_name_en', c.full_name_en, 'edits_left', greatest(0, 3 - c.edits));
end $$;

-- Managers: every survey response with the respondent, and the certificate names that were issued.
create function public.manager_survey() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'qualified', (select count(*) from public.accounts a where a.role = 'ambassador' and (private.progress_for(a.id)->>'qualified')::boolean),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name,
        'university', p.university, 'lang', s.lang, 'answers', s.answers, 'submitted_at', s.submitted_at,
        'cert_hy', c.full_name_hy, 'cert_en', c.full_name_en, 'cert_edits', c.edits) order by s.submitted_at desc), '[]')
      from public.survey_responses s join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id left join public.certificates c on c.user_id = s.user_id));
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.my_certificate()', 'public.submit_survey(text, jsonb)', 'public.set_certificate_names(text, text)', 'public.manager_survey()'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
