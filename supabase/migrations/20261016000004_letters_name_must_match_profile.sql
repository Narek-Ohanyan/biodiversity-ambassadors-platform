-- A letter can only be issued in the requester's own name: the first and last names on it must match the names on
-- their profile (as typed, or the Armenian/English form stored for it; case and spacing ignored). The patronymic is
-- not on the profile, so it is only checked to be Armenian letters. Mismatch raises 'name_mismatch'.
create or replace function public.request_letter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  lng text := p->>'lang';
  fh text := nullif(btrim(p->>'first_name_hy'), ''); lh text := nullif(btrim(p->>'last_name_hy'), ''); ph text := nullif(btrim(p->>'patronymic_hy'), '');
  fe text := nullif(btrim(p->>'first_name_en'), ''); le text := nullif(btrim(p->>'last_name_en'), '');
  pn text := nullif(btrim(p->>'passport_number'), ''); pby text := nullif(btrim(p->>'passport_issued_by'), ''); pbe text := nullif(btrim(p->>'passport_issued_by_en'), '');
  pon date; rec public.standing_letters; prof public.profiles;
  norm text := '[[:space:]]+';
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

  select * into prof from public.profiles where user_id = uid;
  if not found then raise exception 'profile_incomplete'; end if;
  if lng in ('hy', 'both') and not (
       lower(regexp_replace(fh, norm, ' ', 'g')) in (lower(regexp_replace(btrim(coalesce(prof.first_name, '')), norm, ' ', 'g')), lower(regexp_replace(btrim(coalesce(prof.first_name_hy, '')), norm, ' ', 'g')))
   and lower(regexp_replace(lh, norm, ' ', 'g')) in (lower(regexp_replace(btrim(coalesce(prof.last_name, '')), norm, ' ', 'g')), lower(regexp_replace(btrim(coalesce(prof.last_name_hy, '')), norm, ' ', 'g')))) then
    raise exception 'name_mismatch';
  end if;
  if lng in ('en', 'both') and not (
       lower(regexp_replace(fe, norm, ' ', 'g')) in (lower(regexp_replace(btrim(coalesce(prof.first_name, '')), norm, ' ', 'g')), lower(regexp_replace(btrim(coalesce(prof.first_name_en, '')), norm, ' ', 'g')))
   and lower(regexp_replace(le, norm, ' ', 'g')) in (lower(regexp_replace(btrim(coalesce(prof.last_name, '')), norm, ' ', 'g')), lower(regexp_replace(btrim(coalesce(prof.last_name_en, '')), norm, ' ', 'g')))) then
    raise exception 'name_mismatch';
  end if;

  insert into public.standing_letters (user_id, lang, first_name_hy, last_name_hy, patronymic_hy, first_name_en, last_name_en,
      passport_number, passport_issued_on, passport_issued_by, passport_issued_by_en)
    values (uid, lng, case when lng <> 'en' then fh end, case when lng <> 'en' then lh end, case when lng <> 'en' then ph end,
      case when lng <> 'hy' then fe end, case when lng <> 'hy' then le end, pn, pon, pby, case when lng <> 'hy' then pbe end)
    returning * into rec;
  return private.letter_json(rec);
end $$;
