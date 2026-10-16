-- Once a team's approved places reach its capacity, nobody can apply to it any more (existing applications stay
-- as they are; the manager can still approve pending ones only while places are left).
create or replace function public.signup_role(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); cfg public.role_config; prof public.profiles;
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
    if cfg.capacity is not null and (select count(*) from public.role_signups where role = p_role and status = 'approved') >= cfg.capacity then
      raise exception 'role_full';
    end if;
    insert into public.role_signups (user_id, role) values (uid, p_role);
  end if;
  return private.roles_for(uid);
end $$;

-- A "yes" to the Blue Zone question approves a qualified ambassador while places are left; when the team is full
-- the answer is still recorded but no application is created.
create or replace function public.answer_blue_zone(p_has_access boolean) returns jsonb
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
      end if;
    else
      approved := true;
    end if;
  end if;
  return jsonb_build_object('answered', true, 'has_access', p_has_access, 'approved', approved);
end $$;
