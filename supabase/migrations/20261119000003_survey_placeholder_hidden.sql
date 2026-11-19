-- A survey row flagged "_placeholder" keeps the survey step marked done for an ambassador whose answers were removed.
-- Managers do not see such rows in the survey results.
create or replace function public.manager_survey() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'qualified', (select count(*) from public.accounts a where a.role = 'ambassador' and (private.progress_for(a.id)->>'qualified')::boolean),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name,
        'university', p.university, 'lang', s.lang, 'answers', s.answers, 'submitted_at', s.submitted_at,
        'cert_hy', c.full_name_hy, 'cert_en', c.full_name_en, 'cert_edits', c.edits) order by s.submitted_at desc), '[]')
      from public.survey_responses s join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id left join public.certificates c on c.user_id = s.user_id
      where not (s.answers ? '_placeholder')));
end $$;
