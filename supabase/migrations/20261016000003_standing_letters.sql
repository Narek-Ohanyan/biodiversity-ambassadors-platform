-- Letters of standing (Տեղեկանք / certificate of participation). A qualified ambassador fills in a short form;
-- the platform allocates the next serial number (AUCB-BA001, 002, ...; ԿՀԲԿ-ԿԴ001 on the Armenian one), keeps the
-- record, and the client generates the PDF from the stored record (so it can be downloaded again later).
--  * One serial per request, shared by the Armenian and English versions when "both" is chosen.
--  * Numbers are never reused: a letter that was issued with a mistake is voided, not deleted or edited.
--  * Managers see the whole register and can set the next number (e.g. to continue an existing paper series).

create sequence public.letter_serial_seq;

create table public.standing_letters (
  id bigint generated always as identity primary key,
  serial int not null unique default nextval('public.letter_serial_seq'),
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('hy', 'en', 'both')),
  first_name_hy text, last_name_hy text, patronymic_hy text,
  first_name_en text, last_name_en text,
  passport_number text not null,
  passport_issued_on date not null,
  passport_issued_by text not null,
  passport_issued_by_en text,
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
alter table public.standing_letters enable row level security;
revoke all on public.standing_letters from anon, authenticated;
create index standing_letters_user on public.standing_letters (user_id);

create or replace function private.letter_json(l public.standing_letters) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', l.id, 'serial', l.serial, 'lang', l.lang,
    'first_name_hy', l.first_name_hy, 'last_name_hy', l.last_name_hy, 'patronymic_hy', l.patronymic_hy,
    'first_name_en', l.first_name_en, 'last_name_en', l.last_name_en,
    'passport_number', l.passport_number, 'passport_issued_on', l.passport_issued_on,
    'passport_issued_by', l.passport_issued_by, 'passport_issued_by_en', l.passport_issued_by_en,
    'created_at', l.created_at, 'voided_at', l.voided_at);
$$;

create function public.my_letters() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.letter_json(l) order by l.serial desc), '[]')
  from public.standing_letters l where l.user_id = (select auth.uid());
$$;

create function public.request_letter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  lng text := p->>'lang';
  fh text := nullif(btrim(p->>'first_name_hy'), ''); lh text := nullif(btrim(p->>'last_name_hy'), ''); ph text := nullif(btrim(p->>'patronymic_hy'), '');
  fe text := nullif(btrim(p->>'first_name_en'), ''); le text := nullif(btrim(p->>'last_name_en'), '');
  pn text := nullif(btrim(p->>'passport_number'), ''); pby text := nullif(btrim(p->>'passport_issued_by'), ''); pbe text := nullif(btrim(p->>'passport_issued_by_en'), '');
  pon date; rec public.standing_letters;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.accounts where id = uid and role = 'ambassador') then raise exception 'not_ambassador'; end if;
  if not coalesce((private.progress_for(uid)->>'qualified')::boolean, false) then raise exception 'not_qualified'; end if;
  if lng not in ('hy', 'en', 'both') then raise exception 'invalid_letter'; end if;
  if (select count(*) from public.standing_letters where user_id = uid and voided_at is null) >= 5 then raise exception 'letter_limit'; end if;
  begin pon := (p->>'passport_issued_on')::date; exception when others then raise exception 'invalid_letter'; end;
  if pn is null or pn !~ '^[A-Za-z0-9 -]{5,20}$' or pby is null or length(pby) > 120 or pon is null
     or pon < date '1990-01-01' or pon > current_date then raise exception 'invalid_letter'; end if;
  if lng in ('hy', 'both') and (fh is null or lh is null or ph is null or length(fh) > 60 or length(lh) > 60 or length(ph) > 60
     or fh !~ '[Ա-և]' or lh !~ '[Ա-և]' or ph !~ '[Ա-և]') then raise exception 'invalid_letter'; end if;
  if lng in ('en', 'both') then
    if fe is null or le is null or length(fe) > 60 or length(le) > 60 or fe ~ '[Ա-և]' or le ~ '[Ա-և]' then raise exception 'invalid_letter'; end if;
    if pbe is null then pbe := pby; end if;
    if length(pbe) > 120 or pbe ~ '[Ա-և]' then raise exception 'invalid_letter'; end if;
  end if;
  insert into public.standing_letters (user_id, lang, first_name_hy, last_name_hy, patronymic_hy, first_name_en, last_name_en,
      passport_number, passport_issued_on, passport_issued_by, passport_issued_by_en)
    values (uid, lng, case when lng <> 'en' then fh end, case when lng <> 'en' then lh end, case when lng <> 'en' then ph end,
      case when lng <> 'hy' then fe end, case when lng <> 'hy' then le end, pn, pon, pby, case when lng <> 'hy' then pbe end)
    returning * into rec;
  return private.letter_json(rec);
end $$;

-- The owner (or a manager) voids a letter issued with a mistake; its number stays in the register, never reused.
create function public.void_letter(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.standing_letters set voided_at = now()
    where id = p_id and voided_at is null and (user_id = uid or (select private.is_manager()));
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.manager_letters() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'next', coalesce((select max(serial) from public.standing_letters), 0) + 1,
    'rows', (select coalesce(jsonb_agg(private.letter_json(l) || jsonb_build_object('email', a.email, 'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university)
        order by l.serial desc), '[]')
      from public.standing_letters l join public.accounts a on a.id = l.user_id left join public.profiles p on p.user_id = l.user_id));
end $$;

-- Continue an existing numbering: the next letter will get p_next (must be above every number already issued).
create function public.manager_set_letter_next(p_next int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  if p_next is null or p_next < 1 or p_next > 99999 or p_next <= coalesce((select max(serial) from public.standing_letters), 0) then raise exception 'invalid_number'; end if;
  execute format('alter sequence public.letter_serial_seq restart with %s', p_next);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.my_letters()', 'public.request_letter(jsonb)', 'public.void_letter(bigint)', 'public.manager_letters()', 'public.manager_set_letter_next(int)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- "next" is the number the next letter will really get (the sequence), "min" the lowest number that may be set.
create or replace function public.manager_letters() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare nxt int; mx int;
begin
  if not (select private.is_manager()) then raise exception 'forbidden'; end if;
  select case when is_called then last_value + 1 else last_value end into nxt from public.letter_serial_seq;
  select coalesce(max(serial), 0) into mx from public.standing_letters;
  return jsonb_build_object(
    'next', nxt, 'min', mx + 1,
    'rows', (select coalesce(jsonb_agg(private.letter_json(l) || jsonb_build_object('email', a.email, 'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university)
        order by l.serial desc), '[]')
      from public.standing_letters l join public.accounts a on a.id = l.user_id left join public.profiles p on p.user_id = l.user_id));
end $$;

