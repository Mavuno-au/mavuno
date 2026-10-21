-- Minimal stand-ins for the parts of a Supabase database the migrations rely on,
-- so they can be tested in an embedded Postgres (PGlite) without Docker.
-- Never run this against a real Supabase project.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
-- Auth runs its hooks as this role.
create role supabase_auth_admin nologin;

create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create schema storage;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  confirmation_token text,
  recovery_token text,
  email_change_token_new text,
  email_change text,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table auth.identities (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade,
  provider_id text,
  identity_data jsonb,
  provider text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

-- Same lookup order as Supabase's auth.uid().
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant all on storage.objects to anon, authenticated, service_role;

-- Vault: the real one is a view over encrypted rows; a table is enough here.
create schema vault;
create table vault.decrypted_secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  decrypted_secret text,
  created_at timestamptz default now()
);

create publication supabase_realtime;

-- Realtime authorisation: policies on realtime.messages decide who joins and
-- sends on private channels, with the channel name in realtime.topic().
create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;

create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  event text,
  payload jsonb,
  private boolean default true
);

alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated;
grant usage on sequence realtime.messages_id_seq to anon, authenticated;

create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
