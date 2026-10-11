-- =============================================================================
-- Migration 1 : schéma de base (tables, contraintes, index)
--
-- Règles appliquées partout :
--   * chaque table métier porte `institution_id` ;
--   * les liens entre tables utilisent des clés étrangères COMPOSITES
--     (institution_id, id) : la base refuse physiquement de relier une ligne
--     de l'établissement A à une ligne de l'établissement B ;
--   * les dates/heures sont des `timestamptz` (stockées en UTC, affichées en
--     Africa/Algiers par l'application).
-- La sécurité d'accès (RLS) est définie dans la migration 2.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Schéma interne : jamais exposé par l'API Supabase (seuls `public` et
-- `graphql_public` le sont, cf. supabase/config.toml).
create schema if not exists private;

-- Code aléatoire « URL-safe » (utilisé pour les identifiants publics de séance).
create function private.random_code(n_bytes int)
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(n_bytes), 'base64'), '+/=', '-_');
$$;

-- -----------------------------------------------------------------------------
-- Établissements, profils, appartenances
-- -----------------------------------------------------------------------------

create table public.institutions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 2 and 200),
  timezone         text not null default 'Africa/Algiers',
  retention_months int  not null default 36 check (retention_months between 12 and 120),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

-- Complément minimal de auth.users : aucun téléphone, adresse, etc.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '' check (char_length(full_name) <= 200),
  created_at timestamptz not null default now()
);

create table public.departments (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 200),
  created_at     timestamptz not null default now(),
  unique (institution_id, name),
  unique (institution_id, id)
);

create table public.memberships (
  institution_id uuid not null references public.institutions (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  role           text not null check (role in ('admin', 'enseignant')),
  status         text not null default 'active' check (status in ('active', 'disabled')),
  -- Réservé pour un futur rôle « responsable de département » (non utilisé en V1).
  department_id  uuid,
  created_at     timestamptz not null default now(),
  primary key (institution_id, user_id, role),
  foreign key (institution_id, department_id)
    references public.departments (institution_id, id) on delete set null (department_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- -----------------------------------------------------------------------------
-- Organisation pédagogique
-- -----------------------------------------------------------------------------

create table public.semesters (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  label          text not null check (char_length(btrim(label)) between 1 and 100),
  start_date     date not null,
  end_date       date not null,
  created_at     timestamptz not null default now(),
  check (end_date > start_date),
  unique (institution_id, label),
  unique (institution_id, id)
);

create table public.modules (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  department_id  uuid,
  code           text not null check (char_length(btrim(code)) between 1 and 30),
  name           text not null check (char_length(btrim(name)) between 1 and 200),
  created_at     timestamptz not null default now(),
  unique (institution_id, code),
  unique (institution_id, id),
  foreign key (institution_id, department_id)
    references public.departments (institution_id, id) on delete set null (department_id)
);

create table public.groups (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  semester_id    uuid not null,
  department_id  uuid,
  name           text not null check (char_length(btrim(name)) between 1 and 100),
  level          text check (char_length(level) <= 50),
  created_at     timestamptz not null default now(),
  unique (institution_id, semester_id, name),
  unique (institution_id, id),
  foreign key (institution_id, semester_id)
    references public.semesters (institution_id, id) on delete restrict,
  foreign key (institution_id, department_id)
    references public.departments (institution_id, id) on delete set null (department_id)
);
create index groups_semester_id_idx on public.groups (semester_id);

-- Données personnelles minimales : matricule, nom, prénom.
create table public.students (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  -- Normalisé : majuscules, sans espaces (l'application normalise avant envoi).
  matricule      text not null check (matricule ~ '^[A-Z0-9][A-Z0-9./_-]{2,29}$'),
  last_name      text not null check (char_length(btrim(last_name)) between 1 and 100),
  first_name     text not null check (char_length(btrim(first_name)) between 1 and 100),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (institution_id, matricule),
  unique (institution_id, id)
);

create table public.group_students (
  institution_id uuid not null,
  group_id       uuid not null,
  student_id     uuid not null,
  created_at     timestamptz not null default now(),
  primary key (group_id, student_id),
  foreign key (institution_id, group_id)
    references public.groups (institution_id, id) on delete cascade,
  foreign key (institution_id, student_id)
    references public.students (institution_id, id) on delete cascade
);
create index group_students_student_id_idx on public.group_students (student_id);

-- « Qui enseigne quoi à quel groupe ». C'est cette table qui détermine ce
-- qu'un enseignant a le droit de voir.
create table public.teaching_assignments (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  teacher_id     uuid not null,
  -- Colonne constante : sert uniquement à garantir, par clé étrangère, que
  -- l'enseignant est membre de CET établissement avec le rôle « enseignant ».
  teacher_role   text not null default 'enseignant' check (teacher_role = 'enseignant'),
  module_id      uuid not null,
  group_id       uuid not null,
  session_type   text not null check (session_type in ('cours', 'td', 'tp')),
  created_at     timestamptz not null default now(),
  unique (teacher_id, module_id, group_id, session_type),
  unique (institution_id, id),
  foreign key (institution_id, teacher_id, teacher_role)
    references public.memberships (institution_id, user_id, role) on delete restrict,
  foreign key (institution_id, module_id)
    references public.modules (institution_id, id) on delete restrict,
  foreign key (institution_id, group_id)
    references public.groups (institution_id, id) on delete restrict
);
create index teaching_assignments_teacher_id_idx on public.teaching_assignments (teacher_id);
create index teaching_assignments_group_id_idx on public.teaching_assignments (group_id);
create index teaching_assignments_module_id_idx on public.teaching_assignments (module_id);

-- -----------------------------------------------------------------------------
-- Séances et présences
-- -----------------------------------------------------------------------------

create table public.class_sessions (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null,
  assignment_id     uuid not null,
  scheduled_at      timestamptz not null,
  room              text check (char_length(room) <= 50),
  status            text not null default 'planned'
                      check (status in ('planned', 'open', 'closed', 'cancelled')),
  opened_at         timestamptz,
  closed_at         timestamptz,
  checkin_closes_at timestamptz,
  -- Identifiant court, non devinable, utilisé dans l'URL du QR code.
  public_code       text not null unique default private.random_code(9),
  -- Code à 6 chiffres (procédure de secours sans QR) ; défini à l'ouverture.
  fallback_code     text check (fallback_code ~ '^[0-9]{6}$'),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (institution_id, id),
  foreign key (institution_id, assignment_id)
    references public.teaching_assignments (institution_id, id) on delete restrict,
  check (status = 'planned' or status = 'cancelled' or opened_at is not null),
  check (status <> 'closed' or closed_at is not null),
  check (closed_at is null or opened_at is null or closed_at >= opened_at)
);
create index class_sessions_assignment_idx on public.class_sessions (assignment_id, scheduled_at);

-- Jetons QR tournants : seul le hash SHA-256 est stocké, jamais le jeton.
create table public.session_tokens (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  session_id     uuid not null,
  token_hash     bytea not null unique,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  foreign key (institution_id, session_id)
    references public.class_sessions (institution_id, id) on delete cascade
);
create index session_tokens_session_idx on public.session_tokens (session_id, expires_at);

create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  session_id     uuid not null,
  student_id     uuid not null,
  status         text not null check (status in ('present', 'retard', 'absent', 'excuse')),
  source         text not null check (source in ('qr', 'code_secours', 'manuel', 'import_papier', 'cloture')),
  -- Heure du SERVEUR de base de données, jamais celle du téléphone.
  recorded_at    timestamptz not null default now(),
  -- Hash d'un identifiant aléatoire posé en cookie sur l'appareil (pas d'empreinte).
  device_ref     text check (char_length(device_ref) <= 128),
  flags          text[] not null default '{}',
  updated_by     uuid references auth.users (id) on delete set null,
  updated_at     timestamptz,
  -- Détection des doublons garantie par la base, même en cas d'envois simultanés.
  unique (session_id, student_id),
  foreign key (institution_id, session_id)
    references public.class_sessions (institution_id, id) on delete restrict,
  foreign key (institution_id, student_id)
    references public.students (institution_id, id) on delete restrict
);
create index attendance_student_id_idx on public.attendance (student_id);
create index attendance_session_device_idx on public.attendance (session_id, device_ref);

-- Tentatives de pointage (réussies ou non) : limitation de débit et analyse.
-- IP et matricule ne sont stockés que sous forme de hash. Purge à 30 jours.
create table public.checkin_attempts (
  id             bigint generated always as identity primary key,
  institution_id uuid references public.institutions (id) on delete cascade,
  session_id     uuid references public.class_sessions (id) on delete cascade,
  ip_hash        text check (char_length(ip_hash) <= 128),
  device_ref     text check (char_length(device_ref) <= 128),
  matricule_hash text check (char_length(matricule_hash) <= 128),
  result         text not null check (char_length(result) <= 40),
  created_at     timestamptz not null default now()
);
create index checkin_attempts_session_idx on public.checkin_attempts (session_id, created_at);
create index checkin_attempts_ip_idx on public.checkin_attempts (ip_hash, created_at);
create index checkin_attempts_created_idx on public.checkin_attempts (created_at);

-- Journal d'audit : rempli par des triggers, jamais modifié.
create table public.audit_log (
  id             bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  -- Renseigné quand l'événement concerne une séance (permet à l'enseignant
  -- de lire l'audit de SES séances).
  session_id     uuid,
  actor_id       uuid,
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name     text not null,
  row_pk         text,
  old_values     jsonb,
  new_values     jsonb,
  reason         text check (char_length(reason) <= 500),
  created_at     timestamptz not null default now()
);
create index audit_log_institution_idx on public.audit_log (institution_id, created_at);
create index audit_log_session_idx on public.audit_log (session_id) where session_id is not null;
