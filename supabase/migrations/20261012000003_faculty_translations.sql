-- Faculty is free text too, so it gets Armenian/English forms like the name and bio (see profile_translations).
-- Editing the typed faculty clears just its own translations (names and bio are unaffected); the translate-profile
-- function refills them. set_profile_translations now also takes the faculty and, as before, writes only if the
-- profile text is still exactly what was translated.
alter table public.profiles
  add column faculty_hy text, add column faculty_en text,
  add constraint profiles_faculty_translations_len check (
    coalesce(length(faculty_hy), 0) <= 400 and coalesce(length(faculty_en), 0) <= 400);

create or replace function private.validate_profile() returns trigger
language plpgsql set search_path = '' as $$
declare k text; v text;
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name  := nullif(btrim(new.last_name), '');
  new.university := nullif(btrim(new.university), '');
  new.faculty    := nullif(btrim(new.faculty), '');
  new.bio        := nullif(btrim(new.bio), '');
  new.public_email := nullif(btrim(new.public_email), '');

  -- translations describe the OLD text once the originals change
  if tg_op = 'UPDATE' and coalesce(current_setting('app.i18n_write', true), '') <> '1' then
    if new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.bio is distinct from old.bio then
      new.first_name_hy := null; new.first_name_en := null; new.last_name_hy := null; new.last_name_en := null;
      new.bio_hy := null; new.bio_en := null;
    end if;
    if new.faculty is distinct from old.faculty then
      new.faculty_hy := null; new.faculty_en := null;
    end if;
  end if;

  if coalesce(length(new.first_name), 0) > 80 or coalesce(length(new.last_name), 0) > 80
     or coalesce(length(new.university), 0) > 200 or coalesce(length(new.faculty), 0) > 200 then
    raise exception 'field_too_long';
  end if;
  if private.word_count(new.bio) > 150 or coalesce(length(new.bio), 0) > 1600 then
    raise exception 'bio_too_long';
  end if;
  if new.public_email is not null and new.public_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_public_email';
  end if;
  if jsonb_typeof(new.skills) <> 'array' or jsonb_typeof(new.languages) <> 'array' or jsonb_typeof(new.social) <> 'object' then
    raise exception 'invalid_profile_data';
  end if;
  if jsonb_array_length(new.skills) > 30 or jsonb_array_length(new.languages) > 12 then
    raise exception 'invalid_profile_data';
  end if;
  -- social links must be plain http(s) URLs (they are rendered as public links)
  for k, v in select key, value #>> '{}' from jsonb_each(new.social) loop
    if v is not null and v <> '' and (v !~* '^https?://[^\s]+$' or length(v) > 300) then
      raise exception 'invalid_social_link';
    end if;
  end loop;

  new.completed :=
        new.first_name is not null and new.last_name is not null
    and new.university is not null and new.faculty is not null
    and jsonb_array_length(new.skills) >= 1
    and jsonb_array_length(new.languages) >= 1
    and new.bio is not null and new.photo_path is not null;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.set_profile_translations(p_user uuid, p_src jsonb, p_t jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('app.i18n_write', '1', true);
  update public.profiles set
    first_name_hy = nullif(btrim(left(p_t->>'first_name_hy', 120)), ''), first_name_en = nullif(btrim(left(p_t->>'first_name_en', 120)), ''),
    last_name_hy = nullif(btrim(left(p_t->>'last_name_hy', 120)), ''), last_name_en = nullif(btrim(left(p_t->>'last_name_en', 120)), ''),
    bio_hy = nullif(btrim(left(p_t->>'bio_hy', 3200)), ''), bio_en = nullif(btrim(left(p_t->>'bio_en', 3200)), ''),
    faculty_hy = nullif(btrim(left(p_t->>'faculty_hy', 400)), ''), faculty_en = nullif(btrim(left(p_t->>'faculty_en', 400)), '')
  where user_id = p_user
    and first_name is not distinct from nullif(p_src->>'first_name', '')
    and last_name is not distinct from nullif(p_src->>'last_name', '')
    and bio is not distinct from nullif(p_src->>'bio', '')
    and faculty is not distinct from nullif(p_src->>'faculty', '');
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.public_ambassadors() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.user_id, 'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university,
    'faculty', p.faculty, 'bio', p.bio, 'skills', p.skills, 'languages', p.languages, 'social', p.social,
    'public_email', p.public_email, 'photo_path', p.photo_path, 'photo_pos_x', p.photo_pos_x, 'photo_pos_y', p.photo_pos_y,
    'first_name_hy', p.first_name_hy, 'first_name_en', p.first_name_en, 'last_name_hy', p.last_name_hy, 'last_name_en', p.last_name_en,
    'bio_hy', p.bio_hy, 'bio_en', p.bio_en, 'faculty_hy', p.faculty_hy, 'faculty_en', p.faculty_en,
    'published_at', pub.published_at)
    order by pub.published_at desc), '[]')
  from public.publications pub join public.profiles p on p.user_id = pub.user_id where p.completed;
$$;
