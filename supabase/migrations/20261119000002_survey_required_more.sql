-- More survey questions are mandatory: everything except the final "any other comments" question.
-- Newly required: the training-academy ratings (every non-"Other" item answered, or "did not take part"),
-- the three open questions a4/a5/c9 and e13, the three multiple-choice questions c7/c8/d11 (at least one option),
-- and the focus-group question f15. Responses already submitted are not affected.
create or replace function public.submit_survey(p_lang text, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); k text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
  if p_lang not in ('hy', 'en') or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 40000 then raise exception 'invalid_survey'; end if;
  if exists (select 1 from public.survey_responses where user_id = uid) then raise exception 'survey_done'; end if;
  -- single values and texts
  foreach k in array array['a1', 'a4', 'a5', 'b5', 'b6', 'b7', 'c9', 'd10', 'e12', 'e13', 'e14', 'f15'] loop
    if btrim(coalesce(p_answers->>k, '')) = '' then raise exception 'invalid_survey'; end if;
  end loop;
  -- multiple choice: at least one option
  foreach k in array array['c7', 'c8', 'd11'] loop
    if jsonb_typeof(p_answers->k) <> 'array' or jsonb_array_length(p_answers->k) < 1 then raise exception 'invalid_survey'; end if;
  end loop;
  -- rating tables
  if jsonb_typeof(p_answers->'a2') <> 'object' or (select count(*) from jsonb_object_keys(p_answers->'a2')) < 4 then raise exception 'invalid_survey'; end if;
  if jsonb_typeof(p_answers->'a3') <> 'object'
     or (select count(*) from jsonb_object_keys(p_answers->'a3') key
         where key not like '%\_\_name' and key not in ('core_other', 'elective_other', 'soft_other')) < 10 then raise exception 'invalid_survey'; end if;
  insert into public.survey_responses (user_id, lang, answers) values (uid, p_lang, p_answers);
end $$;
