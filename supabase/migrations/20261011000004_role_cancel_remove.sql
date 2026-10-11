-- Let an ambassador cancel their own role enrolment, and let a manager remove someone from a role.
-- Either can be undone by signing up again while the role is still open.

create function public.cancel_role(p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if not exists (select 1 from public.role_config where role = p_role) then raise exception 'invalid_role'; end if;
  delete from public.role_signups where user_id = uid and role = p_role;
  return private.roles_for(uid);
end $$;

create function public.remove_role_signup(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.role_signups where user_id = p_user and role = p_role) then raise exception 'not_found'; end if;
  delete from public.role_signups where user_id = p_user and role = p_role;
  perform private.notify(p_user, 'role_removed', jsonb_build_object('role', p_role));
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.cancel_role(text)', 'public.remove_role_signup(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
