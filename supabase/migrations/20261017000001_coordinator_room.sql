-- Coordinator room: ambassadors APPROVED on the Coordinators team get read-only access to every team's
-- members (names and contacts) and to everyone's planned shifts (summary and individual calendars). It is a
-- separate section: nothing about their own Roles and Schedule pages changes, and they cannot change anything.
-- Managers can call the same functions. Rejected applications are not shown.

create function private.is_coordinator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.role_signups s join public.accounts a on a.id = s.user_id
    where s.user_id = (select auth.uid()) and s.role = 'coordinators' and s.status = 'approved' and a.role = 'ambassador');
$$;
grant execute on function private.is_coordinator() to authenticated;

create function public.my_coordinator() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_coordinator();
$$;

create function public.coordinator_roles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_coordinator() or (select private.is_manager())) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(jsonb_build_object(
        'role', c.role, 'capacity', c.capacity, 'min_hours', c.min_hours, 'sort', c.sort,
        'pending', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'pending'),
        'approved', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'approved')) order by c.sort), '[]')
      from public.role_config c),
    'rows', (select coalesce(jsonb_agg(x order by x->>'created_at'), '[]') from (
      select jsonb_build_object('id', a.id, 'email', a.email, 'public_email', p.public_email, 'role', s.role, 'status', s.status,
        'first_name', p.first_name, 'last_name', p.last_name, 'first_name_en', p.first_name_en, 'last_name_en', p.last_name_en,
        'university', p.university, 'faculty', p.faculty, 'created_at', s.created_at,
        'hours', (select count(*) from public.role_shifts sh where sh.user_id = s.user_id and sh.role = s.role)) as x
      from public.role_signups s
      join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id
      where s.status in ('pending', 'approved')) t));
end $$;

create function public.coordinator_shifts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_coordinator() or (select private.is_manager())) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('u', sh.user_id, 'd', sh.day, 'h', sh.hour, 'r', sh.role, 's', su.status))
    from public.role_shifts sh join public.role_signups su on su.user_id = sh.user_id and su.role = sh.role
    where su.status in ('pending', 'approved')), '[]');
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.my_coordinator()', 'public.coordinator_roles()', 'public.coordinator_shifts()'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
