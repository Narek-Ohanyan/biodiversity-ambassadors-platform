-- BioBlitz has no certificate or check-in sheet to verify against, so it relies on a manager-curated
-- roster of confirmed attendees. Claims are matched against it by normalized name (same token-normalization
-- as the check-in matcher) so the approval decision can be made automatically at submission time.
create table public.bioblitz_roster (
  id bigint generated always as identity primary key,
  raw_name text not null,
  name_norm text not null,
  created_at timestamptz not null default now()
);

alter table public.bioblitz_roster enable row level security;
create policy bioblitz_roster_manager on public.bioblitz_roster for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
grant select, insert, update, delete on public.bioblitz_roster to authenticated;

-- A profile's name matches a roster entry when every token of the profile's normalized name
-- (first + last) appears among the roster entry's tokens. This tolerates the extra patronymic token
-- the manager's list includes and university suffixes appended to some entries. Latin-script aliases
-- are seeded alongside the Armenian roster text for the handful of ambassadors whose profile is in
-- Latin script, since normalization cannot transliterate across alphabets on its own.
create function private.bioblitz_match(uid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare pname text; ptoks text[];
begin
  select private.norm_name(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    into pname from public.profiles where user_id = uid;
  if pname is null or pname = '' then return false; end if;
  ptoks := string_to_array(pname, ' ');
  return exists (select 1 from public.bioblitz_roster r where ptoks <@ string_to_array(r.name_norm, ' '));
end $$;

create function private.bioblitz_status(claim bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.claims; total int;
begin
  select * into c from public.claims where id = claim;
  select count(*) into total from public.bioblitz_roster;
  return jsonb_build_object('dataset_loaded', total > 0, 'matched', private.bioblitz_match(c.user_id));
end $$;

revoke all on function private.bioblitz_match(uuid) from public, anon, authenticated;
revoke all on function private.bioblitz_status(bigint) from public, anon, authenticated;

insert into public.bioblitz_roster (raw_name, name_norm) values
  ('Աբրահամյան Արևիկ Արգամի', private.norm_name('Աբրահամյան Արևիկ Արգամի')),
  ('Tatevik Megrabian Hrairi', private.norm_name('Tatevik Megrabian Hrairi')),
  ('Սլավա Սամվելի Սեյրանյան', private.norm_name('Սլավա Սամվելի Սեյրանյան')),
  ('Seyranyan Slava Samveli', private.norm_name('Seyranyan Slava Samveli')),
  ('Մարիա Կարենի Խաչատրյան', private.norm_name('Մարիա Կարենի Խաչատրյան')),
  ('Միլենա Սերգեյի Մարգարյան', private.norm_name('Միլենա Սերգեյի Մարգարյան')),
  ('Լարիսա Արմանի Կիրակոսյան', private.norm_name('Լարիսա Արմանի Կիրակոսյան')),
  ('Աստղիկ Ալոյան Մուշեղի', private.norm_name('Աստղիկ Ալոյան Մուշեղի')),
  ('Լիլի Հակոբյան Արմենի', private.norm_name('Լիլի Հակոբյան Արմենի')),
  ('Անաստասիա Ներսեսյան Անդրեյի', private.norm_name('Անաստասիա Ներսեսյան Անդրեյի')),
  ('Հայրապետյան Նորա Ալեքսանի', private.norm_name('Հայրապետյան Նորա Ալեքսանի')),
  ('Սարգսյան Սոնա Գևորգի', private.norm_name('Սարգսյան Սոնա Գևորգի')),
  ('Հովհաննիսյան Ալվարդ - ԵՊՀ', private.norm_name('Հովհաննիսյան Ալվարդ - ԵՊՀ')),
  ('Սնդոյան Արփինե', private.norm_name('Սնդոյան Արփինե')),
  ('Աթայան Սարգիս', private.norm_name('Աթայան Սարգիս')),
  ('Sargis Atayan', private.norm_name('Sargis Atayan')),
  ('Պետրոսյան Աշոտ Տիգրանի ԵՊՀ', private.norm_name('Պետրոսյան Աշոտ Տիգրանի ԵՊՀ')),
  ('Ashot Petrosyan', private.norm_name('Ashot Petrosyan')),
  ('Տաթև Գաբրիելյան Արմենի ԵՊՀ', private.norm_name('Տաթև Գաբրիելյան Արմենի ԵՊՀ')),
  ('Լուիզա Գրիգորյան Արմենի ԵՊՀ', private.norm_name('Լուիզա Գրիգորյան Արմենի ԵՊՀ')),
  ('Ռոզա Դանիելյան Արկադիի ԵՊՀ', private.norm_name('Ռոզա Դանիելյան Արկադիի ԵՊՀ')),
  ('Հայկ Յազերյան Գևորգի ԵՊՀ', private.norm_name('Հայկ Յազերյան Գևորգի ԵՊՀ')),
  ('Սաղաթելյան Նարինե Աշոտի', private.norm_name('Սաղաթելյան Նարինե Աշոտի')),
  ('Լիլի Ծուղունյան Կարենի UFAR', private.norm_name('Լիլի Ծուղունյան Կարենի UFAR')),
  ('Լիլիա Գասպարյան AUA', private.norm_name('Լիլիա Գասպարյան AUA')),
  ('Lili Gasparyan', private.norm_name('Lili Gasparyan')),
  ('Էլմիրա Զեմֆիրա Մխիթարյան ՀՊՏՀ', private.norm_name('Էլմիրա Զեմֆիրա Մխիթարյան ՀՊՏՀ')),
  ('Մարգարիտ Ռոստոմյան ՀՊՏՀ', private.norm_name('Մարգարիտ Ռոստոմյան ՀՊՏՀ')),
  ('Սոֆի Նազարյան ԵՊՀ', private.norm_name('Սոֆի Նազարյան ԵՊՀ')),
  ('Մարիամ Ղազարյան ՀԱԱՀ', private.norm_name('Մարիամ Ղազարյան ՀԱԱՀ')),
  ('Mariam Ghazaryan', private.norm_name('Mariam Ghazaryan')),
  ('Անյա Անուշ Հայրապետյան', private.norm_name('Անյա Անուշ Հայրապետյան')),
  ('Anya Anush Hayrapetya', private.norm_name('Anya Anush Hayrapetya')),
  ('Աիդա Պետրոսյան Արայիկի ԵՊՀ', private.norm_name('Աիդա Պետրոսյան Արայիկի ԵՊՀ'));
