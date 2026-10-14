-- The manager QR-code page names its download files after the ambassador, which needs their Latin-script
-- name (the typed name can be Armenian). Add the English forms to the manager list.
create or replace function public.manager_ambassadors() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') from (
    select jsonb_build_object(
      'id', a.id, 'email', a.email, 'created_at', a.created_at, 'last_seen_at', a.last_seen_at,
      'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university, 'faculty', p.faculty,
      'first_name_en', p.first_name_en, 'last_name_en', p.last_name_en,
      'photo_path', p.photo_path, 'completed', coalesce(p.completed, false),
      'progress', private.progress_for(a.id), 'status', private.status_of(a.id),
      'published_at', pub.published_at) as x
    from public.accounts a
    left join public.profiles p on p.user_id = a.id
    left join public.publications pub on pub.user_id = a.id
    where a.role = 'ambassador') t);
end $$;
