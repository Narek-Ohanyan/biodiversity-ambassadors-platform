-- Profile photos keep their original proportions and are shown in square frames, which crops them. These
-- two columns say where the square window sits within the photo (CSS object-position percentages), so heads
-- stay in frame instead of being cut by a centered crop. NULL means "not set": the site falls back to a
-- top-biased default. A new upload clears them (see api.saveProfile) until they are recomputed.
alter table public.profiles
  add column photo_pos_x smallint check (photo_pos_x between 0 and 100),
  add column photo_pos_y smallint check (photo_pos_y between 0 and 100);

create or replace function public.public_ambassadors() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.user_id, 'first_name', p.first_name, 'last_name', p.last_name, 'university', p.university,
    'faculty', p.faculty, 'bio', p.bio, 'skills', p.skills, 'languages', p.languages, 'social', p.social,
    'public_email', p.public_email, 'photo_path', p.photo_path, 'photo_pos_x', p.photo_pos_x, 'photo_pos_y', p.photo_pos_y,
    'published_at', pub.published_at)
    order by pub.published_at desc), '[]')
  from public.publications pub join public.profiles p on p.user_id = pub.user_id where p.completed;
$$;
