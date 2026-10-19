-- An ambassador with no approved team is accepted straight away when they apply, whatever the team's capacity
-- (a team can end up above its capacity this way). Exceptions that stay manual (pending, subject to capacity):
--   * the coordinator groups: Coordinators and AUCB Pavilion Volunteer Coordinators;
--   * Rapporteurs (Blue Zones) unless the ambassador said they have Blue Zone access.
-- Once someone has an approved team, further applications follow the normal rules (pending; closed when full).
-- The same rule is applied once, here, to existing applications of people who currently have no approved team:
-- their earliest eligible application (pending first, then rejected) is approved.

create or replace function public.signup_role(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); cfg public.role_config; prof public.profiles; auto boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  select * into cfg from public.role_config where role = p_role;
  if not found then raise exception 'invalid_role'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found or not prof.completed then raise exception 'profile_incomplete'; end if;
  if not exists (select 1 from public.role_signups where user_id = uid and role = p_role) then
    if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
    if cfg.deadline is not null and now() > cfg.deadline then raise exception 'role_closed'; end if;
    auto := p_role not in ('coordinators', 'pavilion_coordinators')
      and not exists (select 1 from public.role_signups where user_id = uid and status = 'approved')
      and (p_role <> 'rapporteur' or coalesce((select has_access from public.blue_zone_answers where user_id = uid), false));
    if not auto and cfg.capacity is not null and (select count(*) from public.role_signups where role = p_role and status = 'approved') >= cfg.capacity then
      raise exception 'role_full';
    end if;
    insert into public.role_signups (user_id, role, status, decided_at)
      values (uid, p_role, case when auto then 'approved' else 'pending' end, case when auto then now() end);
    if auto then perform private.notify(uid, 'role_approved', jsonb_build_object('role', p_role)); end if;
  end if;
  return private.roles_for(uid);
end $$;

do $$
declare r record;
begin
  for r in
    with q as (
      select a.id from public.accounts a
      where a.role = 'ambassador' and (private.progress_for(a.id)->>'qualified')::boolean
        and not exists (select 1 from public.role_signups s where s.user_id = a.id and s.status = 'approved')
    ), cand as (
      select s.user_id, s.role, row_number() over (partition by s.user_id order by (s.status = 'pending') desc, s.created_at) rn
      from public.role_signups s join q on q.id = s.user_id
      where s.role not in ('coordinators', 'pavilion_coordinators')
        and (s.role <> 'rapporteur' or exists (select 1 from public.blue_zone_answers b where b.user_id = s.user_id and b.has_access))
    )
    select user_id, role from cand where rn = 1
  loop
    update public.role_signups set status = 'approved', decided_at = now() where user_id = r.user_id and role = r.role;
    perform private.notify(r.user_id, 'role_approved', jsonb_build_object('role', r.role));
  end loop;
end $$;
