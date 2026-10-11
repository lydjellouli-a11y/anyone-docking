-- =============================================================================
-- Imitation MINIMALE de l'environnement Supabase, pour tester les migrations
-- sur un PostgreSQL simple (sans Docker).
--
-- ⚠ Ce fichier n'est JAMAIS appliqué sur un vrai projet Supabase : il ne sert
-- qu'au script scripts/test-db.sh. Il reproduit :
--   * les rôles anon / authenticated / service_role ;
--   * les droits par défaut que Supabase accorde sur le schéma public
--     (afin de vérifier que nos migrations les retirent bien) ;
--   * auth.users et auth.uid() (lu depuis request.jwt.claims, comme Supabase).
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists extensions;
create schema if not exists auth;

grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Droits par défaut accordés par Supabase sur le schéma public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create function auth.uid()
returns uuid language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create function auth.role()
returns text language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
