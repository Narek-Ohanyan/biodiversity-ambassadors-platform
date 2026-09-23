-- UNICEF Training Modules become a real Coursera-style course: sequential modules, each with a
-- locked sequence of videos (no skipping ahead) and a quiz, verified server-side so none of it can
-- be beaten by calling the API directly. Completing all 5 modules auto-awards the 20 core credits,
-- exactly as the old manual set_unicef_module toggle did — the difference is that reaching that
-- point is now actually earned.

-- ── content ──────────────────────────────────────────────────────────────────
update public.unicef_modules set title_en = data.en, title_hy = data.hy, desc_en = null, desc_hy = null, url = null
from (values
  ('m1', 'Climate Change: A Scientific Overview', 'Կլիմայի փոփոխությունը. գիտական ակնարկ'),
  ('m2', 'Biodiversity: What Do We Know About It', 'Կենսաբազմազանություն: Ի՞նչ գիտենք դրա մասին'),
  ('m3', 'Pollution, Waste and Circular Economy', 'Աղտոտվածություն, թափոններ և շրջանաձև տնտեսություն'),
  ('m4', 'Environmental Policy Making and Advocacy', 'Շրջակա միջավայրի քաղաքականության մշակում և խթանում'),
  ('m5', 'Public Awareness and Civic Engagement: A Youth Context', 'Հանրային իրազեկում և քաղաքացիական ներգրավում. երիտասարդական համատեքստ')
) as data(id, en, hy)
where public.unicef_modules.id = data.id;

create table public.unicef_videos (
  id text primary key,
  module_id text not null references public.unicef_modules(id),
  sort int not null,
  dir text not null,      -- media/unicef_modules/<dir>/<filename>
  filename text not null,
  title_en text not null,
  title_hy text not null
);
insert into public.unicef_videos (id, module_id, sort, dir, filename, title_en, title_hy) values
  ('m1v1', 'm1', 1, 'module1', 'Climate Change Scientific Overview_Part 1_1080p.mp4', 'Part 1', 'Մաս 1'),
  ('m1v2', 'm1', 2, 'module1', 'Climate Change Scientific Overview_Part 2_1080p.mp4', 'Part 2', 'Մաս 2'),
  ('m1v3', 'm1', 3, 'module1', 'Climate Change Scientific Overview_Part_3_1080p.mp4', 'Part 3', 'Մաս 3'),
  ('m1v4', 'm1', 4, 'module1', 'Climate Change Scientific Overview_ Part 4_1080p.mp4', 'Part 4', 'Մաս 4'),
  ('m2v1', 'm2', 1, 'module2', 'Biodiversity_Session 1_1080p.mp4', 'Part 1', 'Մաս 1'),
  ('m2v2', 'm2', 2, 'module2', 'Biodiversity_Session 2_1080p.mp4', 'Part 2', 'Մաս 2'),
  ('m2v3', 'm2', 3, 'module2', 'Biodiversity_Session 3_1080p.mp4', 'Part 3', 'Մաս 3'),
  ('m2v4', 'm2', 4, 'module2', 'Biodiversity_Session 4_1080p.mp4', 'Part 4', 'Մաս 4'),
  ('m3v1', 'm3', 1, 'module3', '[Part 1] UNICEF Training Module_ Pollution, Waste and Circular Economy_1080p.mp4', 'Part 1', 'Մաս 1'),
  ('m3v2', 'm3', 2, 'module3', '[Part 2] UNICEF Training Module_ Pollution, Waste and Circular Economy_1080p.mp4', 'Part 2', 'Մաս 2'),
  ('m3v3', 'm3', 3, 'module3', '[Part 3] UNICEF Training Module_ Pollution, Waste and Circular Economy_1080p.mp4', 'Part 3', 'Մաս 3'),
  ('m3v4', 'm3', 4, 'module3', '[Part 4] UNICEF Training Module_ Pollution, Waste and Circular Economy_1080p.mp4', 'Part 4', 'Մաս 4'),
  ('m4v1', 'm4', 1, 'module4', 'Topic 4_ Advocacy and Policy Making_Part 1_1080p.mp4', 'Part 1', 'Մաս 1'),
  ('m4v2', 'm4', 2, 'module4', 'Topic 4_ Advocacy and Policy Making_Part 2_1080p.mp4', 'Part 2', 'Մաս 2'),
  ('m4v3', 'm4', 3, 'module4', 'Topic 4_ Advocacy and Policy Making_Part 3_1080p.mp4', 'Part 3', 'Մաս 3'),
  ('m4v4', 'm4', 4, 'module4', 'Topic 4։ Advocacy and Policy Making_Part 4_1080p.mp4', 'Part 4', 'Մաս 4'),
  ('m4v5', 'm4', 5, 'module4', 'Topic 4։ Advocacy and Policy Making_Part 5_1080p.mp4', 'Part 5', 'Մաս 5'),
  ('m4v6', 'm4', 6, 'module4', 'Topic 4_ Advocacy and Policy Making_Part 6_1080p.mp4', 'Part 6', 'Մաս 6'),
  ('m5v1', 'm5', 1, 'module5', 'Awareness raising Part 1_1080p.mp4', 'Part 1', 'Մաս 1'),
  ('m5v2', 'm5', 2, 'module5', 'Awareness raising Part 2_1080p.mp4', 'Part 2', 'Մաս 2'),
  ('m5v3', 'm5', 3, 'module5', 'Awareness raising Part 3_1080p.mp4', 'Part 3', 'Մաս 3'),
  ('m5v4', 'm5', 4, 'module5', 'Awareness raising Part 4_1080p.mp4', 'Part 4', 'Մաս 4');

-- Placeholder quiz bank — replace with real questions per module; see README for how.
create table public.unicef_quiz_questions (
  id text primary key,
  module_id text not null references public.unicef_modules(id),
  sort int not null,
  question_en text not null,
  question_hy text not null,
  options jsonb not null,   -- [{"key":"a","en":"...","hy":"..."}, ...]
  correct text[] not null   -- option keys; never exposed to clients (see grants below)
);
insert into public.unicef_quiz_questions (id, module_id, sort, question_en, question_hy, options, correct) values
  ('m1q1', 'm1', 1, 'How many parts does this module''s video series have?', 'Քանի՞ մասից է բաղկացած այս մոդուլի տեսանյութերի շարքը։',
   '[{"key":"a","en":"2","hy":"2"},{"key":"b","en":"4","hy":"4"},{"key":"c","en":"6","hy":"6"}]', '{b}'),
  ('m1q2', 'm1', 2, 'This module gives a scientific overview of which topic?', 'Այս մոդուլը որ թեմայի գիտական ակնարկն է տալիս։',
   '[{"key":"a","en":"Climate change","hy":"Կլիմայի փոփոխություն"},{"key":"b","en":"Ocean currents","hy":"Օվկիանոսի հոսանքներ"},{"key":"c","en":"Volcanic activity","hy":"Հրաբխային ակտիվություն"}]', '{a}'),
  ('m2q1', 'm2', 1, 'What is the main subject of this module?', 'Ո՞րն է այս մոդուլի հիմնական թեման։',
   '[{"key":"a","en":"Biodiversity","hy":"Կենսաբազմազանություն"},{"key":"b","en":"Urban planning","hy":"Քաղաքային պլանավորում"},{"key":"c","en":"Renewable energy","hy":"Վերականգնվող էներգիա"}]', '{a}'),
  ('m2q2', 'm2', 2, 'How many video sessions make up this module?', 'Քանի՞ տեսանյութային նիստից է բաղկացած այս մոդուլը։',
   '[{"key":"a","en":"3","hy":"3"},{"key":"b","en":"4","hy":"4"},{"key":"c","en":"5","hy":"5"}]', '{b}'),
  ('m3q1', 'm3', 1, 'Which three themes does this module cover together?', 'Ո՞ր երեք թեմաներն է միասին ընդգրկում այս մոդուլը։',
   '[{"key":"a","en":"Pollution, waste and circular economy","hy":"Աղտոտվածություն, թափոններ և շրջանաձև տնտեսություն"},{"key":"b","en":"Trade, tourism and finance","hy":"Առևտուր, զբոսաշրջություն և ֆինանսներ"},{"key":"c","en":"Agriculture, fishing and forestry","hy":"Գյուղատնտեսություն, ձկնորսություն և անտառտնտեսություն"}]', '{a}'),
  ('m4q1', 'm4', 1, 'What is this module about?', 'Ինչի՞ մասին է այս մոդուլը։',
   '[{"key":"a","en":"Advocacy and policy making","hy":"Ջատագովություն և քաղաքականության մշակում"},{"key":"b","en":"Personal finance","hy":"Անձնական ֆինանսներ"},{"key":"c","en":"Software engineering","hy":"Ծրագրային ապահովման ինժեներիա"}]', '{a}'),
  ('m4q2', 'm4', 2, 'How many parts does this module have?', 'Քանի՞ մասից է բաղկացած այս մոդուլը։',
   '[{"key":"a","en":"4","hy":"4"},{"key":"b","en":"5","hy":"5"},{"key":"c","en":"6","hy":"6"}]', '{c}'),
  ('m5q1', 'm5', 1, 'Who is the primary audience this module focuses on engaging?', 'Ո՞ր հանդիսատեսի ներգրավման վրա է հիմնականում կենտրոնացած այս մոդուլը։',
   '[{"key":"a","en":"Youth","hy":"Երիտասարդություն"},{"key":"b","en":"Retirees","hy":"Կենսաթոշակառուներ"},{"key":"c","en":"Corporations","hy":"Կորպորացիաներ"}]', '{a}');

create table public.unicef_video_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null references public.unicef_videos(id),
  max_time numeric not null default 0,
  duration numeric,
  completed boolean not null default false,
  last_reported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table public.unicef_quiz_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null references public.unicef_modules(id),
  answers jsonb not null,
  score int not null,
  total int not null,
  passed boolean not null,
  attempted_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.unicef_videos enable row level security;
alter table public.unicef_quiz_questions enable row level security;
alter table public.unicef_video_progress enable row level security;
alter table public.unicef_quiz_attempts enable row level security;

create policy unicef_videos_read on public.unicef_videos for select to authenticated using (true);
create policy quiz_questions_read on public.unicef_quiz_questions for select to authenticated using (true);
create policy video_progress_read on public.unicef_video_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_manager()));
create policy quiz_attempts_read on public.unicef_quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_manager()));

grant select on public.unicef_videos, public.unicef_quiz_questions, public.unicef_video_progress, public.unicef_quiz_attempts to authenticated;
-- The answer key is never sent to the client; only the SECURITY DEFINER submit_quiz() below can see it.
revoke select (correct) on public.unicef_quiz_questions from authenticated;

-- ── the old manual "tick a checkbox" mechanism is gone ───────────────────────
drop function if exists public.set_unicef_module(text, boolean);

-- ── status for the ambassador's own view ─────────────────────────────────────
create function public.my_unicef_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  done_modules text[];
  result jsonb := '[]';
  m record;
  is_unlocked boolean; is_done boolean; all_videos_done boolean;
  vlist jsonb; quiz jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(array_agg(module_id), '{}') into done_modules from public.unicef_progress where user_id = uid;

  for m in select * from public.unicef_modules order by sort loop
    is_done := m.id = any(done_modules);
    is_unlocked := (m.sort = 1) or exists (
      select 1 from public.unicef_modules pm where pm.sort = m.sort - 1 and pm.id = any(done_modules));

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', v.id, 'sort', v.sort, 'title_en', v.title_en, 'title_hy', v.title_hy,
             'dir', v.dir, 'filename', v.filename,
             'max_time', coalesce(vp.max_time, 0), 'duration', vp.duration,
             'completed', coalesce(vp.completed, false),
             'unlocked', is_unlocked and not exists (
               select 1 from public.unicef_videos ev left join public.unicef_video_progress evp
                 on evp.video_id = ev.id and evp.user_id = uid
               where ev.module_id = m.id and ev.sort < v.sort and not coalesce(evp.completed, false))
           ) order by v.sort), '[]')
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
      'unlocked', is_unlocked, 'completed', is_done, 'all_videos_done', coalesce(all_videos_done, false),
      'videos', vlist, 'quiz', coalesce(quiz, jsonb_build_object('attempted', false)));
  end loop;
  return result;
end $$;

-- ── recording watch progress (rate-limited so reported time can't outrun real elapsed time) ─
create function public.report_video_progress(p_video text, p_time numeric, p_duration numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v public.unicef_videos; m public.unicef_modules; prof public.profiles;
  module_unlocked boolean; prior_done boolean;
  existing public.unicef_video_progress;
  secs_elapsed numeric; allowed_increase numeric; new_max numeric; is_completed boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if private.is_locked() then raise exception 'deadline_passed'; end if;
  select * into v from public.unicef_videos where id = p_video;
  if not found then raise exception 'invalid_video'; end if;
  select * into m from public.unicef_modules where id = v.module_id;
  select * into prof from public.profiles where user_id = uid;
  if not found or not prof.completed then raise exception 'profile_incomplete'; end if;

  module_unlocked := (m.sort = 1) or exists (
    select 1 from public.unicef_progress up join public.unicef_modules pm on pm.id = up.module_id
    where up.user_id = uid and pm.sort = m.sort - 1);
  if not module_unlocked then raise exception 'module_locked'; end if;

  select bool_and(coalesce(vp.completed, false)) into prior_done
  from public.unicef_videos ev left join public.unicef_video_progress vp on vp.video_id = ev.id and vp.user_id = uid
  where ev.module_id = v.module_id and ev.sort < v.sort;
  if not coalesce(prior_done, true) then raise exception 'video_locked'; end if;

  p_time := greatest(0, coalesce(p_time, 0));
  if p_duration is not null and p_duration > 0 then p_time := least(p_time, p_duration); end if;

  select * into existing from public.unicef_video_progress where user_id = uid and video_id = p_video;
  if existing is null then
    new_max := least(p_time, 1.5 * 8 + 5); -- generous first-ping allowance; can't claim a lot on the very first report
    is_completed := p_duration is not null and p_duration > 0 and new_max >= p_duration - 3;
    insert into public.unicef_video_progress (user_id, video_id, max_time, duration, completed, last_reported_at)
    values (uid, p_video, new_max, p_duration, is_completed, now());
  else
    secs_elapsed := greatest(0, extract(epoch from (now() - existing.last_reported_at)));
    allowed_increase := secs_elapsed * 1.5 + 5; -- small grace for buffering/network jitter
    new_max := greatest(existing.max_time, least(p_time, existing.max_time + allowed_increase));
    is_completed := existing.completed
      or (p_duration is not null and p_duration > 0 and new_max >= p_duration - 3)
      or (existing.duration is not null and existing.duration > 0 and new_max >= existing.duration - 3);
    update public.unicef_video_progress
      set max_time = new_max, duration = coalesce(p_duration, existing.duration),
          completed = is_completed, last_reported_at = now(), updated_at = now()
      where user_id = uid and video_id = p_video;
  end if;

  return jsonb_build_object('max_time', new_max, 'completed', is_completed);
end $$;

-- ── quiz submission (server holds the answer key; scores and gates credit) ──
create function public.submit_quiz(p_module text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  m public.unicef_modules; prof public.profiles;
  module_unlocked boolean; all_videos_done boolean;
  q record; total int := 0; correct_count int := 0; given text[];
  act public.activities; ap int; remaining int; creds int; done_count int; total_modules int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if private.is_locked() then raise exception 'deadline_passed'; end if;
  select * into m from public.unicef_modules where id = p_module;
  if not found then raise exception 'invalid_module'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found or not prof.completed then raise exception 'profile_incomplete'; end if;

  module_unlocked := (m.sort = 1) or exists (
    select 1 from public.unicef_progress up join public.unicef_modules pm on pm.id = up.module_id
    where up.user_id = uid and pm.sort = m.sort - 1);
  if not module_unlocked then raise exception 'module_locked'; end if;

  select bool_and(coalesce(vp.completed, false)) into all_videos_done
  from public.unicef_videos v left join public.unicef_video_progress vp on vp.video_id = v.id and vp.user_id = uid
  where v.module_id = p_module;
  if not coalesce(all_videos_done, false) then raise exception 'videos_incomplete'; end if;

  for q in select * from public.unicef_quiz_questions where module_id = p_module loop
    total := total + 1;
    given := array(select jsonb_array_elements_text(coalesce(p_answers->q.id, '[]'::jsonb)));
    if not exists (select unnest(given) except select unnest(q.correct))
       and not exists (select unnest(q.correct) except select unnest(given)) then
      correct_count := correct_count + 1;
    end if;
  end loop;
  if total = 0 then raise exception 'no_questions'; end if;

  insert into public.unicef_quiz_attempts (user_id, module_id, answers, score, total, passed, attempted_at)
  values (uid, p_module, p_answers, correct_count, total, (correct_count::numeric / total) >= 0.7, now())
  on conflict (user_id, module_id) do update
    set answers = excluded.answers, score = excluded.score, total = excluded.total, passed = excluded.passed, attempted_at = now();

  if (correct_count::numeric / total) >= 0.7 then
    insert into public.unicef_progress (user_id, module_id) values (uid, p_module) on conflict do nothing;

    select count(*) into done_count from public.unicef_progress where user_id = uid;
    select count(*) into total_modules from public.unicef_modules;
    if done_count >= total_modules
       and not exists (select 1 from public.claims where user_id = uid and activity_key = 'unicef' and status in ('pending', 'approved')) then
      select * into act from public.activities where key = 'unicef';
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
  end if;

  return jsonb_build_object('score', correct_count, 'total', total, 'passed', (correct_count::numeric / total) >= 0.7);
end $$;

revoke all on function public.my_unicef_status() from public, anon;
grant execute on function public.my_unicef_status() to authenticated;
revoke all on function public.report_video_progress(text, numeric, numeric) from public, anon;
grant execute on function public.report_video_progress(text, numeric, numeric) to authenticated;
revoke all on function public.submit_quiz(text, jsonb) from public, anon;
grant execute on function public.submit_quiz(text, jsonb) to authenticated;
