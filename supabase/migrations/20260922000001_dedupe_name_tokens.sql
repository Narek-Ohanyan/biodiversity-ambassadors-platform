-- Attendance sheets sometimes have the surname typed twice (once in "First Name", once in "Last Name" —
-- a data-entry slip, not uncommon in real spreadsheets). Deduplicating tokens before comparing means a
-- name like "Nane Hovhikyan Hovhikyan" still normalises the same as "Nane Hovhikyan" for matching purposes.
create or replace function private.norm_name(s text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(distinct t, ' ' order by t), '')
  from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(s, ''), '[^[:alpha:][:space:]]', ' ', 'g')), '\s+')) t
  where t <> '';
$$;
