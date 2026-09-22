-- Biodiversity Ambassadors Platform: tables, row-level security and helpers.
-- All business rules (credit caps, deadline, publication) live in SECURITY DEFINER functions (next migration);
-- clients never write to claims/notifications/publications directly.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ── reference data ───────────────────────────────────────────────────────────
create table public.settings (key text primary key, value text not null);
insert into public.settings values
  ('display_deadline', '2026-10-12'),                 -- what ambassadors are told
  ('system_deadline',  '2026-10-15T23:59:59+04:00');  -- when every claim button really locks

create table public.categories (
  key text primary key, required int not null check (required > 0), name_en text not null, name_hy text not null
);
insert into public.categories values
  ('core', 40, 'Core', 'Հիմնական'),
  ('elective', 10, 'Elective', 'Ընտրովի'),
  ('soft', 10, 'Soft Skills', 'Փափուկ հմտություններ');

create table public.activities (
  key text primary key,
  category text not null references public.categories(key),
  credits int not null check (credits > 0),
  kind text not null check (kind in ('checkin','portal','certificate','form','claim')),
  is_other boolean not null default false,
  keywords text[] not null default '{}',
  sort int not null default 0
);
insert into public.activities (key, category, credits, kind, is_other, keywords, sort) values
  ('inperson',       'core',     20, 'checkin',     false, '{}', 1),
  ('unicef',         'core',     20, 'portal',      false, '{}', 2),
  ('gybn_intl',      'core',     20, 'certificate', false, '{gybn,"global youth biodiversity network",training}', 3),
  ('gybn_youth',     'core',     20, 'certificate', false, '{gybn,workshop,"young leaders",youth,cop17}', 4),
  ('foracca',        'core',     20, 'certificate', false, '{foracca,"autumn school",wsl,acopian}', 5),
  ('core_other',     'core',     20, 'form',        true,  '{}', 6),
  ('bioblitz',       'elective', 10, 'claim',       false, '{}', 7),
  ('action_plan',    'elective', 10, 'form',        false, '{}', 8),
  ('campaign',       'elective', 10, 'form',        false, '{}', 9),
  ('elective_other', 'elective', 10, 'form',        true,  '{}', 10),
  ('culture_comm',   'soft',     10, 'certificate', false, '{communication,"culture partnership",culturepartnership,culture}', 11),
  ('soft_other',     'soft',     10, 'form',        true,  '{}', 12);

create table public.unicef_modules (
  id text primary key, sort int not null,
  title_en text not null, title_hy text not null,
  desc_en text, desc_hy text, url text
);
insert into public.unicef_modules (id, sort, title_en, title_hy, desc_en, desc_hy) values
  ('m1', 1, 'Module 1', 'Մոդուլ 1', 'Placeholder – replace with the UNICEF module title and description.', 'Տեղապահ – փոխարինեք UNICEF-ի մոդուլի վերնագրով և նկարագրությամբ։'),
  ('m2', 2, 'Module 2', 'Մոդուլ 2', 'Placeholder – replace with the UNICEF module title and description.', 'Տեղապահ – փոխարինեք UNICEF-ի մոդուլի վերնագրով և նկարագրությամբ։'),
  ('m3', 3, 'Module 3', 'Մոդուլ 3', 'Placeholder – replace with the UNICEF module title and description.', 'Տեղապահ – փոխարինեք UNICEF-ի մոդուլի վերնագրով և նկարագրությամբ։'),
  ('m4', 4, 'Module 4', 'Մոդուլ 4', 'Placeholder – replace with the UNICEF module title and description.', 'Տեղապահ – փոխարինեք UNICEF-ի մոդուլի վերնագրով և նկարագրությամբ։'),
  ('m5', 5, 'Module 5', 'Մոդուլ 5', 'Placeholder – replace with the UNICEF module title and description.', 'Տեղապահ – փոխարինեք UNICEF-ի մոդուլի վերնագրով և նկարագրությամբ։');

-- ── accounts (role) ──────────────────────────────────────────────────────────
create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'ambassador' check (role in ('ambassador','manager')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create function private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.accounts where id = (select auth.uid()) and role = 'manager');
$$;
grant execute on function private.is_manager() to authenticated;

-- New sign-ups are always ambassadors; the manager role is granted by hand.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accounts (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text, last_name text, university text, faculty text,
  skills jsonb not null default '[]',
  languages jsonb not null default '[]',
  bio text,
  photo_path text,
  social jsonb not null default '{}',
  public_email text,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create function private.word_count(s text) returns int
language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(s, '')) = '' then 0
              else array_length(regexp_split_to_array(btrim(s), '\s+'), 1) end;
$$;
grant execute on function private.word_count(text) to authenticated, anon;

create function private.validate_profile() returns trigger
language plpgsql set search_path = '' as $$
declare k text; v text;
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name  := nullif(btrim(new.last_name), '');
  new.university := nullif(btrim(new.university), '');
  new.faculty    := nullif(btrim(new.faculty), '');
  new.bio        := nullif(btrim(new.bio), '');
  new.public_email := nullif(btrim(new.public_email), '');

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
create trigger profiles_validate before insert or update on public.profiles
  for each row execute function private.validate_profile();

-- Set once an ambassador reaches 60 credits; written only by SECURITY DEFINER functions.
create table public.publications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  published_at timestamptz not null default now()
);

-- ── credits ──────────────────────────────────────────────────────────────────
create table public.claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_key text not null references public.activities(key),
  category text not null references public.categories(key),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  credits int not null default 0,
  form jsonb not null default '{}',
  scan jsonb,
  manager_comment text,
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index claims_user_idx on public.claims(user_id);
create index claims_status_idx on public.claims(status);

create table public.claim_files (
  id bigint generated always as identity primary key,
  claim_id bigint not null references public.claims(id) on delete cascade,
  path text not null,
  original_name text not null,
  mime text,
  size bigint,
  sha256 text
);
create index claim_files_claim_idx on public.claim_files(claim_id);
create index claim_files_sha_idx on public.claim_files(sha256);

create table public.unicef_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null references public.unicef_modules(id),
  completed_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

-- ── notifications / announcements ────────────────────────────────────────────
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  params jsonb not null default '{}',
  popup boolean not null default false,
  popup_seen_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.announcements (
  id bigint generated always as identity primary key,
  sender uuid references auth.users(id) on delete set null,
  title_en text, title_hy text, body_en text, body_hy text,
  audience jsonb not null,
  recipients int not null default 0,
  created_at timestamptz not null default now()
);

-- ── check-in datasets (attendance sheets uploaded by the manager) ───────────
create table public.checkin_batches (
  id bigint generated always as identity primary key,
  filename text not null,
  rows int not null default 0,
  uploaded_at timestamptz not null default now()
);
create table public.checkin_records (
  id bigint generated always as identity primary key,
  batch_id bigint not null references public.checkin_batches(id) on delete cascade,
  name text, email text, email_norm text, name_norm text,
  raw jsonb not null default '{}'
);
create index checkin_email_idx on public.checkin_records(email_norm);
create index checkin_name_idx on public.checkin_records(name_norm);

create function private.norm_name(s text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(t, ' ' order by t), '')
  from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(s, ''), '[^[:alpha:][:space:]]', ' ', 'g')), '\s+')) t
  where t <> '';
$$;

create function private.checkin_norm() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email_norm := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.name_norm  := nullif(private.norm_name(new.name), '');
  return new;
end $$;
create trigger checkin_records_norm before insert or update on public.checkin_records
  for each row execute function private.checkin_norm();

-- ── contact form ─────────────────────────────────────────────────────────────
create table public.contact_messages (
  id bigint generated always as identity primary key,
  name text not null, email text not null, subject text, message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── row-level security ───────────────────────────────────────────────────────
alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.activities enable row level security;
alter table public.unicef_modules enable row level security;
alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.publications enable row level security;
alter table public.claims enable row level security;
alter table public.claim_files enable row level security;
alter table public.unicef_progress enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.checkin_batches enable row level security;
alter table public.checkin_records enable row level security;
alter table public.contact_messages enable row level security;

create policy settings_read     on public.settings       for select to anon, authenticated using (true);
create policy categories_read   on public.categories     for select to anon, authenticated using (true);
create policy activities_read   on public.activities     for select to anon, authenticated using (true);
create policy modules_read      on public.unicef_modules for select to authenticated using (true);

create policy accounts_read     on public.accounts for select to authenticated
  using (id = (select auth.uid()) or (select private.is_manager()));

create policy profiles_read     on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_manager()));
create policy profiles_insert   on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update   on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy publications_read on public.publications for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_manager()));

create policy claims_read       on public.claims for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_manager()));
create policy claim_files_read  on public.claim_files for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id
                 and (c.user_id = (select auth.uid()) or (select private.is_manager()))));
create policy unicef_progress_read on public.unicef_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_manager()));

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy announcements_read on public.announcements for select to authenticated
  using ((select private.is_manager()));

create policy checkin_batches_manager on public.checkin_batches for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
create policy checkin_records_manager on public.checkin_records for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));

create policy contact_read on public.contact_messages for select to authenticated
  using ((select private.is_manager()));

-- Table privileges: clients get only what the policies above allow.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.settings, public.categories, public.activities to anon, authenticated;
grant select on public.unicef_modules, public.accounts, public.publications, public.claims,
  public.claim_files, public.unicef_progress, public.notifications, public.announcements,
  public.contact_messages to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.checkin_batches, public.checkin_records to authenticated;
