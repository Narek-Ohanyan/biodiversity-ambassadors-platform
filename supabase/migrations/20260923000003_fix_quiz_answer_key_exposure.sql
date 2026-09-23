-- Fix a real privilege bug: `grant select on unicef_quiz_questions to authenticated` followed by
-- `revoke select (correct) ... from authenticated` does NOT hide the `correct` column — in Postgres,
-- a table-wide grant and a column-level revoke don't compose that way; the table-wide grant already
-- covers every column, so the column-level revoke is a silent no-op. This was caught by testing a real
-- client .select('*') call, which still returned the answer key.
--
-- Fix: remove ALL direct client access to this table (both roles) and serve it only through a
-- SECURITY DEFINER function that explicitly picks the safe columns — the same pattern used
-- everywhere else in this schema for anything that needs to hide part of a row.
revoke all on public.unicef_quiz_questions from authenticated, anon;
drop policy if exists quiz_questions_read on public.unicef_quiz_questions;

create function public.unicef_quiz_questions_for(p_module text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'module_id', module_id, 'sort', sort,
    'question_en', question_en, 'question_hy', question_hy, 'options', options
  ) order by sort), '[]')
  from public.unicef_quiz_questions where module_id = p_module;
$$;
revoke all on function public.unicef_quiz_questions_for(text) from public, anon;
grant execute on function public.unicef_quiz_questions_for(text) to authenticated;
