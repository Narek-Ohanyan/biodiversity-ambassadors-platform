-- Webinar: a mandatory, live-attended activity tracked with manager-controlled check-in / check-out.
--
-- Credit rules (decided at check-out and stored on the claim):
--   * elective approved credits < 10  -> the webinar's 10 credits are filed under Elective (fills the gap)
--   * elective approved credits >= 10 -> the 10 credits are filed under the Webinar category as a bonus
--                                        (total can reach 70) and the ambassador gets the Priority flag
-- Attending (or being excused by a manager) is required to qualify.

alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('checkin','portal','certificate','form','claim','webinar'));

insert into public.categories (key, required, name_en, name_hy) values ('webinar', 10, 'Webinar', 'Վեբինար');
insert into public.activities (key, category, credits, kind, is_other, keywords, sort)
  values ('webinar', 'webinar', 10, 'webinar', false, '{}', 14);
insert into public.settings (key, value) values ('webinar_checkin_open', 'false'), ('webinar_checkout_open', 'false')
  on conflict (key) do nothing;

create table public.webinar_attendance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  excused boolean not null default false,
  excused_at timestamptz
);
alter table public.webinar_attendance enable row level security;
revoke all on public.webinar_attendance from anon, authenticated;

-- Progress now has three requirement categories (core/elective/soft = 60) plus the webinar:
-- webinar credits that landed in the Webinar category are a bonus on top (total can exceed 60),
-- and qualification additionally needs the webinar attended or excused.
create or replace function private.progress_for(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cats jsonb := '{}'; total int := 0; req_total int := 0; r record; ap int; pe int;
  wreq int; bonus int; wpend int; attended boolean; excused boolean; done boolean;
begin
  for r in select key, required from public.categories where key <> 'webinar' loop
    select coalesce(sum(credits) filter (where status = 'approved'), 0),
           coalesce(sum(credits) filter (where status = 'pending'), 0)
      into ap, pe from public.claims where user_id = uid and category = r.key;
    cats := cats || jsonb_build_object(r.key, jsonb_build_object(
      'required', r.required, 'earned', least(ap, r.required), 'pending', pe,
      'complete', ap >= r.required, 'full', ap + pe >= r.required));
    total := total + least(ap, r.required);
    req_total := req_total + r.required;
  end loop;

  select required into wreq from public.categories where key = 'webinar';
  select coalesce(sum(credits) filter (where status = 'approved'), 0),
         coalesce(sum(credits) filter (where status = 'pending'), 0)
    into bonus, wpend from public.claims where user_id = uid and category = 'webinar';
  bonus := least(bonus, wreq);
  attended := exists (select 1 from public.claims where user_id = uid and activity_key = 'webinar' and status = 'approved');
  excused := coalesce((select w.excused from public.webinar_attendance w where w.user_id = uid), false);
  done := attended or excused;
  cats := cats || jsonb_build_object('webinar', jsonb_build_object(
    'required', wreq, 'earned', bonus, 'pending', wpend, 'complete', done, 'full', done,
    'attended', attended, 'excused', excused, 'priority', bonus > 0));

  return jsonb_build_object('categories', cats, 'total', total + bonus, 'base_total', total, 'required', req_total,
    'qualified', total >= req_total and done);
end $$;

create function private.webinar_status(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'checkin_open', coalesce((select value from public.settings where key = 'webinar_checkin_open'), 'false') = 'true',
    'checkout_open', coalesce((select value from public.settings where key = 'webinar_checkout_open'), 'false') = 'true',
    'checked_in_at', w.checked_in_at, 'checked_out_at', w.checked_out_at,
    'excused', coalesce(w.excused, false),
    'done', exists (select 1 from public.claims c where c.user_id = uid and c.activity_key = 'webinar' and c.status = 'approved'),
    'bonus', exists (select 1 from public.claims c where c.user_id = uid and c.activity_key = 'webinar' and c.status = 'approved' and c.category = 'webinar'))
  from (select 1) s left join public.webinar_attendance w on w.user_id = uid;
$$;
revoke all on function private.webinar_status(uuid) from public, anon, authenticated;
