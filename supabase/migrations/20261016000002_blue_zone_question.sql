-- Every ambassador is asked (a blocking pop-up on entering the platform, until answered) whether they have
-- Blue Zone access. The answers go to the managers. A qualified ambassador who answers YES is approved straight
-- away as a Blue Zones Rapporteur (team key `rapporteur`), unless that team has a capacity and is already full
-- (then the application stays pending). The answer can be changed later; a "no" never removes an approval by
-- itself (managers decide that).

create table public.blue_zone_answers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  has_access boolean not null,
  answered_at timestamptz not null default now()
);
alter table public.blue_zone_answers enable row level security;
revoke all on public.blue_zone_answers from anon, authenticated;

create function public.my_blue_zone() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('answered', b.user_id is not null, 'has_access', b.has_access)
  from (select 1) s left join public.blue_zone_answers b on b.user_id = (select auth.uid());
$$;

create function public.answer_blue_zone(p_has_access boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); cap int; cur text; approved boolean := false;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  insert into public.blue_zone_answers (user_id, has_access) values (uid, p_has_access)
    on conflict (user_id) do update set has_access = excluded.has_access, answered_at = now();

  if p_has_access and coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then
    select capacity into cap from public.role_config where role = 'rapporteur';
    select status into cur from public.role_signups where user_id = uid and role = 'rapporteur';
    if cur is distinct from 'approved' then
      if cap is null or (select count(*) from public.role_signups where role = 'rapporteur' and status = 'approved') < cap then
        insert into public.role_signups (user_id, role, status, decided_at) values (uid, 'rapporteur', 'approved', now())
          on conflict (user_id, role) do update set status = 'approved', decided_at = now();
        perform private.notify(uid, 'role_approved', jsonb_build_object('role', 'rapporteur'));
        approved := true;
      elsif cur is null then
        insert into public.role_signups (user_id, role) values (uid, 'rapporteur');
      end if;
    else
      approved := true;
    end if;
  end if;
  return jsonb_build_object('answered', true, 'has_access', p_has_access, 'approved', approved);
end $$;

-- Managers: every ambassador with their answer (null = not answered yet) and their Blue Zones application status.
create function public.manager_blue_zone() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return (select coalesce(jsonb_agg(x order by (x->>'answered_at') desc nulls last), '[]') from (
    select jsonb_build_object('id', a.id, 'email', a.email, 'first_name', p.first_name, 'last_name', p.last_name,
      'university', p.university, 'has_access', b.has_access, 'answered_at', b.answered_at,
      'qualified', coalesce((private.progress_for(a.id)->>'qualified')::boolean, false),
      'status', s.status) as x
    from public.accounts a
    left join public.profiles p on p.user_id = a.id
    left join public.blue_zone_answers b on b.user_id = a.id
    left join public.role_signups s on s.user_id = a.id and s.role = 'rapporteur'
    where a.role = 'ambassador') t);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.my_blue_zone()', 'public.answer_blue_zone(boolean)', 'public.manager_blue_zone()'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- the manager's application table shows the answer next to each Blue Zones applicant
create or replace function public.manager_roles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(jsonb_build_object(
        'role', c.role, 'capacity', c.capacity, 'min_hours', c.min_hours, 'sort', c.sort, 'needs_recording', c.recording_url is not null,
        'pending', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'pending'),
        'approved', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'approved'),
        'rejected', (select count(*) from public.role_signups x where x.role = c.role and x.status = 'rejected')) order by c.sort), '[]')
      from public.role_config c),
    'rows', (select coalesce(jsonb_agg(x order by x->>'created_at'), '[]') from (
      select jsonb_build_object('id', a.id, 'email', a.email, 'role', s.role, 'status', s.status,
        'first_name', p.first_name, 'last_name', p.last_name, 'first_name_en', p.first_name_en, 'last_name_en', p.last_name_en,
        'university', p.university, 'faculty', p.faculty, 'created_at', s.created_at,
        'watched', s.recording_watched_at is not null, 'watched_at', s.recording_watched_at,
        'blue_zone', b.has_access,
        'hours', (select count(*) from public.role_shifts sh where sh.user_id = s.user_id and sh.role = s.role),
        'qualified', coalesce((private.progress_for(a.id)->>'qualified')::boolean, false)) as x
      from public.role_signups s
      join public.accounts a on a.id = s.user_id
      left join public.profiles p on p.user_id = s.user_id
      left join public.blue_zone_answers b on b.user_id = s.user_id) t));
end $$;
