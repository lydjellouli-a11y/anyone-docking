-- =============================================================================
-- Présence QR — schéma complet (généré par scripts/build-deploy-sql.sh)
-- NE PAS MODIFIER À LA MAIN. À exécuter UNE SEULE FOIS sur un projet Supabase
-- neuf : Supabase → SQL Editor → coller tout le fichier → Run.
-- =============================================================================
begin;

-- >>> 20261011000001_schema.sql
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

-- >>> 20261011000002_security.sql
-- =============================================================================
-- Migration 2 : sécurité en base (droits, RLS, fonctions d'aide, audit)
--
-- Principe : on RETIRE tous les droits, puis on n'accorde que le strict
-- nécessaire. Le rôle `anon` (visiteur non connecté, ex. étudiant) n'a
-- AUCUN droit sur aucune table ni fonction : le pointage étudiant passera
-- par le serveur Next.js (migration de la phase 5).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Droits par défaut
-- -----------------------------------------------------------------------------

-- Postgres accorde EXECUTE à PUBLIC sur toute nouvelle fonction : on l'interdit.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
revoke execute on all functions in schema private from public;

-- Supabase accorde par défaut tous les droits sur les tables de `public` à
-- anon et authenticated : on repart de zéro.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Le schéma `private` n'est pas exposé par l'API, mais les politiques RLS
-- appellent ses fonctions avec les droits de l'utilisateur connecté.
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Fonctions d'aide pour les politiques RLS
--    SECURITY DEFINER : elles lisent memberships / teaching_assignments sans
--    être elles-mêmes soumises à la RLS (évite les boucles), mais ne renvoient
--    qu'un booléen concernant l'utilisateur connecté (auth.uid()).
-- -----------------------------------------------------------------------------

create function private.is_member(p_institution uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.institution_id = p_institution
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.has_role(p_institution uuid, p_role text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.institution_id = p_institution
      and m.user_id = (select auth.uid())
      and m.role = p_role
      and m.status = 'active'
  );
$$;

-- Vrai si l'utilisateur connecté est l'enseignant (actif) de cette affectation.
create function private.owns_assignment(p_assignment uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.memberships m
      on m.institution_id = ta.institution_id
     and m.user_id = ta.teacher_id
     and m.role = 'enseignant'
    where ta.id = p_assignment
      and ta.teacher_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.teaches_group(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.memberships m
      on m.institution_id = ta.institution_id
     and m.user_id = ta.teacher_id
     and m.role = 'enseignant'
    where ta.group_id = p_group
      and ta.teacher_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.teaches_module(p_module uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.memberships m
      on m.institution_id = ta.institution_id
     and m.user_id = ta.teacher_id
     and m.role = 'enseignant'
    where ta.module_id = p_module
      and ta.teacher_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.owns_session(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.class_sessions s
    where s.id = p_session and private.owns_assignment(s.assignment_id)
  );
$$;

-- Vrai si l'étudiant est inscrit dans au moins un groupe enseigné par l'utilisateur.
create function private.can_see_student(p_student uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_students gs
    where gs.student_id = p_student and private.teaches_group(gs.group_id)
  );
$$;

-- Vrai si l'utilisateur connecté est admin d'un établissement dont p_user est membre.
create function private.is_admin_of_user(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships target
    where target.user_id = p_user
      and private.has_role(target.institution_id, 'admin')
  );
$$;

grant execute on function
  private.is_member(uuid),
  private.has_role(uuid, text),
  private.owns_assignment(uuid),
  private.teaches_group(uuid),
  private.teaches_module(uuid),
  private.owns_session(uuid),
  private.can_see_student(uuid),
  private.is_admin_of_user(uuid),
  -- valeur par défaut de class_sessions.public_code, évaluée avec les droits
  -- de l'enseignant qui crée la séance
  private.random_code(int)
to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Activation de la RLS sur TOUTES les tables
--    (un test vérifie qu'aucune table de `public` n'y échappe)
-- -----------------------------------------------------------------------------

alter table public.institutions          enable row level security;
alter table public.profiles              enable row level security;
alter table public.departments           enable row level security;
alter table public.memberships           enable row level security;
alter table public.semesters             enable row level security;
alter table public.modules               enable row level security;
alter table public.groups                enable row level security;
alter table public.students              enable row level security;
alter table public.group_students        enable row level security;
alter table public.teaching_assignments  enable row level security;
alter table public.class_sessions        enable row level security;
alter table public.session_tokens        enable row level security;
alter table public.attendance            enable row level security;
alter table public.checkin_attempts      enable row level security;
alter table public.audit_log             enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Droits (GRANT) + politiques (POLICY) par table
--    Le GRANT dit « quelle opération est possible », la POLICY dit « sur
--    quelles lignes ». Les deux sont nécessaires.
-- -----------------------------------------------------------------------------

-- institutions : lecture par les membres, modification par les admins.
-- Création uniquement via la fonction create_workspace().
grant select on public.institutions to authenticated;
grant update (name, retention_months) on public.institutions to authenticated;
create policy institutions_select on public.institutions
  for select to authenticated using (private.is_member(id));
create policy institutions_update on public.institutions
  for update to authenticated
  using (private.has_role(id, 'admin'))
  with check (private.has_role(id, 'admin'));

-- profiles : chacun voit/modifie le sien ; un admin voit ceux de ses membres.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.is_admin_of_user(id));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships : chacun voit les siennes ; l'admin gère celles de SON établissement.
grant select, insert, delete on public.memberships to authenticated;
grant update (status, department_id) on public.memberships to authenticated;
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role(institution_id, 'admin'));
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (private.has_role(institution_id, 'admin'));
create policy memberships_update on public.memberships
  for update to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (private.has_role(institution_id, 'admin'));

-- departments, semesters : lecture par les membres, gestion par l'admin.
grant select, insert, update, delete on public.departments, public.semesters to authenticated;

create policy departments_select on public.departments
  for select to authenticated using (private.is_member(institution_id));
create policy departments_write on public.departments
  for all to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));

create policy semesters_select on public.semesters
  for select to authenticated using (private.is_member(institution_id));
create policy semesters_write on public.semesters
  for all to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));

-- modules, groups : l'admin voit et gère tout ; l'enseignant voit ce qui lui est affecté.
grant select, insert, update, delete on public.modules, public.groups to authenticated;

create policy modules_select on public.modules
  for select to authenticated
  using (private.has_role(institution_id, 'admin') or private.teaches_module(id));
create policy modules_write on public.modules
  for all to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));

create policy groups_select on public.groups
  for select to authenticated
  using (private.has_role(institution_id, 'admin') or private.teaches_group(id));
create policy groups_write on public.groups
  for all to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));

-- students, group_students : l'admin gère ; l'enseignant lit les étudiants de
-- ses groupes. (L'import par l'enseignant passera par une fonction dédiée,
-- phase 4.)
grant select, insert, update, delete on public.students, public.group_students to authenticated;

create policy students_select on public.students
  for select to authenticated
  using (private.has_role(institution_id, 'admin') or private.can_see_student(id));
create policy students_write on public.students
  for all to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));

create policy group_students_select on public.group_students
  for select to authenticated
  using (private.has_role(institution_id, 'admin') or private.teaches_group(group_id));
create policy group_students_write on public.group_students
  for all to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));

-- teaching_assignments : l'admin gère ; l'enseignant lit les siennes.
grant select, insert, update, delete on public.teaching_assignments to authenticated;
create policy teaching_assignments_select on public.teaching_assignments
  for select to authenticated
  using (private.has_role(institution_id, 'admin') or teacher_id = (select auth.uid()));
create policy teaching_assignments_write on public.teaching_assignments
  for all to authenticated
  using (private.has_role(institution_id, 'admin'))
  with check (private.has_role(institution_id, 'admin'));

-- class_sessions : l'enseignant crée/planifie SES séances ; l'admin lit tout.
-- Seules les colonnes de planification sont modifiables directement ; le
-- statut (ouverture, clôture) ne changera QUE via des fonctions (phase 4-5).
grant select on public.class_sessions to authenticated;
grant insert (institution_id, assignment_id, scheduled_at, room) on public.class_sessions to authenticated;
grant update (scheduled_at, room) on public.class_sessions to authenticated;
create policy class_sessions_select on public.class_sessions
  for select to authenticated
  using (private.has_role(institution_id, 'admin') or private.owns_assignment(assignment_id));
create policy class_sessions_insert on public.class_sessions
  for insert to authenticated
  with check (private.owns_assignment(assignment_id) and created_by is not distinct from (select auth.uid()));
create policy class_sessions_update on public.class_sessions
  for update to authenticated
  using (private.owns_assignment(assignment_id) and status = 'planned')
  with check (private.owns_assignment(assignment_id) and status = 'planned');

-- attendance : lecture seulement (admin ou enseignant de la séance).
-- Aucune écriture directe : pointage et corrections via fonctions (phases 4-5).
grant select on public.attendance to authenticated;
create policy attendance_select on public.attendance
  for select to authenticated
  using (private.has_role(institution_id, 'admin') or private.owns_session(session_id));

-- audit_log : lecture par l'admin, ou par l'enseignant pour ses séances.
grant select on public.audit_log to authenticated;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    private.has_role(institution_id, 'admin')
    or (session_id is not null and private.owns_session(session_id))
  );

-- session_tokens, checkin_attempts : AUCUN droit pour anon/authenticated.
-- (RLS activée sans politique = tout refusé, en plus de l'absence de GRANT.)

-- -----------------------------------------------------------------------------
-- 5. Remplissage automatique de created_by sur les séances
-- -----------------------------------------------------------------------------

create function private.set_session_created_by()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger class_sessions_set_created_by
  before insert on public.class_sessions
  for each row execute function private.set_session_created_by();

-- -----------------------------------------------------------------------------
-- 6. Création automatique du profil à l'inscription (Supabase Auth)
-- -----------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- 7. Garde-fou : un établissement garde toujours au moins un admin actif
-- -----------------------------------------------------------------------------

create function private.keep_one_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.status <> 'active')
     -- Pas de contrôle si l'établissement lui-même est en cours de suppression.
     and exists (select 1 from public.institutions i where i.id = old.institution_id)
     and not exists (
       select 1 from public.memberships m
       where m.institution_id = old.institution_id
         and m.role = 'admin' and m.status = 'active'
         and m.user_id <> old.user_id
     )
  then
    raise exception 'Impossible de retirer le dernier administrateur actif de l''établissement'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_one_admin
  before update or delete on public.memberships
  for each row execute function private.keep_one_admin();

-- -----------------------------------------------------------------------------
-- 8. Journal d'audit (triggers) — append-only
-- -----------------------------------------------------------------------------

create function private.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_row     jsonb := to_jsonb(coalesce(new, old));
  v_session uuid;
  v_pk      text;
begin
  -- Établissement en cours de suppression : rien à journaliser (le journal
  -- de cet établissement est lui-même supprimé).
  if not exists (select 1 from public.institutions i
                 where i.id = (v_row ->> 'institution_id')::uuid) then
    return null;
  end if;

  v_session := case tg_table_name
                 when 'class_sessions' then (v_row ->> 'id')::uuid
                 when 'attendance'     then (v_row ->> 'session_id')::uuid
               end;
  v_pk := coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'student_id');

  insert into public.audit_log
    (institution_id, session_id, actor_id, action, table_name, row_pk,
     old_values, new_values, reason)
  values (
    (v_row ->> 'institution_id')::uuid,
    v_session,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    v_pk,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    -- Justification fournie par les fonctions de correction (phase 4).
    nullif(current_setting('app.audit_reason', true), '')
  );
  return null;
end;
$$;

create trigger audit_attendance
  after insert or update or delete on public.attendance
  for each row execute function private.audit_row();
create trigger audit_class_sessions
  after insert or update or delete on public.class_sessions
  for each row execute function private.audit_row();
create trigger audit_memberships
  after insert or update or delete on public.memberships
  for each row execute function private.audit_row();
create trigger audit_students
  after insert or update or delete on public.students
  for each row execute function private.audit_row();

-- Le journal est en ajout seul : toute modification est refusée.
-- La suppression n'est possible que par la procédure de purge de conservation
-- (phase 7), qui positionnera explicitement app.retention_purge = 'on'.
create function private.audit_log_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'Le journal d''audit ne peut pas être modifié' using errcode = 'P0001';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

-- -----------------------------------------------------------------------------
-- 9. Création d'un espace de travail (établissement initial)
--    Appelable par un utilisateur connecté. L'utilisateur devient admin ET
--    enseignant de l'établissement créé. Limité à 3 établissements créés par
--    utilisateur pour éviter les abus.
-- -----------------------------------------------------------------------------

create function public.create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if (select count(*) from public.institutions where created_by = v_uid) >= 3 then
    raise exception 'Nombre maximal d''espaces de travail atteint' using errcode = 'P0001';
  end if;

  insert into public.institutions (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_id;

  insert into public.memberships (institution_id, user_id, role)
  values (v_id, v_uid, 'admin'), (v_id, v_uid, 'enseignant');

  return v_id;
end;
$$;

revoke execute on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

-- >>> 20261011000003_sections_import.sql
-- =============================================================================
-- Migration 3 : sections, importation des étudiants, annulation de séance
--
-- Organisation pédagogique :
--   * une SECTION (ex. « L1 Biologie — Section 1 ») regroupe des GROUPES de TD
--     (G1, G2, G3…) ;
--   * un cours magistral est affecté à la section ; un TD/TP à un groupe ;
--   * la liste d'une section = ses inscrits directs + ceux de ses groupes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sections (hiérarchie à un seul niveau dans la table groups)
-- -----------------------------------------------------------------------------

alter table public.groups
  add column kind text not null default 'groupe' check (kind in ('section', 'groupe')),
  add column parent_id uuid,
  add constraint groups_parent_fk foreign key (institution_id, parent_id)
    references public.groups (institution_id, id) on delete restrict,
  add constraint groups_only_groupe_has_parent check (parent_id is null or kind = 'groupe'),
  add constraint groups_not_own_parent check (parent_id is distinct from id);

create index groups_parent_id_idx on public.groups (parent_id);

-- « G1 » peut exister dans deux sections différentes du même semestre.
alter table public.groups drop constraint groups_institution_id_semester_id_name_key;
alter table public.groups
  add constraint groups_unique_name unique nulls not distinct (institution_id, semester_id, parent_id, name);

-- Le parent doit être une section du même semestre ; une section qui a des
-- groupes ne peut pas redevenir un simple groupe.
create function private.check_group_parent()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_parent record;
begin
  if new.parent_id is not null then
    -- Recherche limitée au même établissement : un parent d'un autre
    -- établissement n'est pas trouvé ici, et la clé étrangère composite le
    -- refuse ensuite (sans message révélant son existence).
    select kind, semester_id into v_parent from public.groups
    where id = new.parent_id and institution_id = new.institution_id;
    if not found then
      return new;
    end if;
    if v_parent.kind <> 'section' then
      raise exception 'Un groupe ne peut être rattaché qu''à une section' using errcode = '23514';
    end if;
    if v_parent.semester_id <> new.semester_id then
      raise exception 'Le groupe et sa section doivent appartenir au même semestre' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.kind = 'groupe' and old.kind = 'section'
     and exists (select 1 from public.groups g where g.parent_id = new.id) then
    raise exception 'Cette section contient des groupes' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger groups_check_parent
  before insert or update on public.groups
  for each row execute function private.check_group_parent();

-- L'enseignant d'un cours de SECTION voit aussi les groupes de cette section
-- (et donc leurs étudiants). L'enseignant d'un TD ne voit que son groupe.
create or replace function private.teaches_group(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.memberships m
      on m.institution_id = ta.institution_id
     and m.user_id = ta.teacher_id
     and m.role = 'enseignant'
    where ta.teacher_id = (select auth.uid())
      and m.status = 'active'
      and (
        ta.group_id = p_group
        or ta.group_id = (select g.parent_id from public.groups g where g.id = p_group)
      )
  );
$$;

-- Journalisation des inscriptions/désinscriptions dans les groupes.
create trigger audit_group_students
  after insert or update or delete on public.group_students
  for each row execute function private.audit_row();

-- -----------------------------------------------------------------------------
-- 2. Importation d'une liste d'étudiants dans un groupe (ou une section)
--
-- p_rows : tableau JSON [{ "matricule": "...", "nom": "...", "prenom": "..." }]
-- Règles :
--   * réservé à l'admin de l'établissement ou à un enseignant du groupe ;
--   * tout ou rien : une seule ligne invalide annule l'importation entière ;
--   * un matricule déjà connu dans l'établissement n'est PAS recréé, et ses
--     nom/prénom ne sont PAS écrasés : la différence est signalée ;
--   * 2000 lignes maximum par import.
-- -----------------------------------------------------------------------------

create function public.import_students(p_group_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst      uuid;
  v_row       jsonb;
  v_mat       text;
  v_last      text;
  v_first     text;
  v_student   record;
  v_line      int := 0;
  v_inserted  int;
  v_created   int := 0;
  v_linked    int := 0;
  v_already   int := 0;
  v_mismatch  jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select g.institution_id into v_inst from public.groups g where g.id = p_group_id;
  if v_inst is null
     or not (private.has_role(v_inst, 'admin') or private.teaches_group(p_group_id)) then
    -- Même message si le groupe n'existe pas : on ne révèle rien.
    raise exception 'Groupe introuvable ou accès refusé' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Format de liste invalide' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 2000 then
    raise exception 'La liste doit contenir entre 1 et 2000 étudiants' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_line  := v_line + 1;
    v_mat   := upper(regexp_replace(coalesce(v_row ->> 'matricule', ''), '\s', '', 'g'));
    v_last  := btrim(coalesce(v_row ->> 'nom', ''));
    v_first := btrim(coalesce(v_row ->> 'prenom', ''));

    if v_mat !~ '^[A-Z0-9][A-Z0-9./_-]{2,29}$'
       or char_length(v_last) not between 1 and 100
       or char_length(v_first) not between 1 and 100 then
      raise exception 'Ligne % invalide (matricule « % »)', v_line, left(v_mat, 30)
        using errcode = '22023';
    end if;

    select s.id, s.last_name, s.first_name into v_student
    from public.students s
    where s.institution_id = v_inst and s.matricule = v_mat;

    if v_student.id is null then
      insert into public.students (institution_id, matricule, last_name, first_name)
      values (v_inst, v_mat, v_last, v_first)
      returning id, last_name, first_name into v_student;
      v_created := v_created + 1;
    elsif lower(v_student.last_name) <> lower(v_last) or lower(v_student.first_name) <> lower(v_first) then
      v_mismatch := v_mismatch || jsonb_build_object(
        'matricule', v_mat,
        'enregistre', v_student.last_name || ' ' || v_student.first_name,
        'fichier', v_last || ' ' || v_first
      );
    end if;

    insert into public.group_students (institution_id, group_id, student_id)
    values (v_inst, p_group_id, v_student.id)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      v_linked := v_linked + 1;
    else
      v_already := v_already + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'crees', v_created,
    'ajoutes', v_linked,
    'deja_presents', v_already,
    'noms_differents', v_mismatch
  );
end;
$$;

revoke execute on function public.import_students(uuid, jsonb) from public, anon;
grant execute on function public.import_students(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Annulation d'une séance planifiée (le statut ne change que par fonction)
-- -----------------------------------------------------------------------------

create function public.cancel_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.owns_session(p_session_id) then
    raise exception 'Séance introuvable ou accès refusé' using errcode = '42501';
  end if;
  update public.class_sessions
     set status = 'cancelled'
   where id = p_session_id and status = 'planned';
  if not found then
    raise exception 'Seule une séance planifiée peut être annulée' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.cancel_session(uuid) from public, anon;
grant execute on function public.cancel_session(uuid) to authenticated;

-- >>> 20261011000004_checkin.sql
-- =============================================================================
-- Migration 4 : ouverture de séance, QR code tournant, pointage étudiant,
-- clôture, corrections manuelles justifiées.
--
-- Répartition des rôles :
--   * l'ENSEIGNANT (authenticated) ouvre, prolonge, fait tourner le QR, clôture
--     et corrige — uniquement pour SES séances ;
--   * le POINTAGE ÉTUDIANT passe par le serveur Next.js, qui appelle
--     validate_scan() et record_checkin() avec la clé secrète (service_role).
--     Ces deux fonctions ne sont PAS appelables avec la clé publique.
-- Toutes les heures viennent de l'horloge du serveur de base (now()).
-- =============================================================================

-- Un code de secours (6 chiffres) est unique parmi les séances ouvertes.
create unique index class_sessions_open_fallback_code_idx
  on public.class_sessions (fallback_code) where status = 'open';

-- -----------------------------------------------------------------------------
-- Liste des étudiants attendus à une séance : ceux du groupe de l'enseignement,
-- et, pour une section, ceux de ses groupes.
-- -----------------------------------------------------------------------------
create function private.session_roster(p_session uuid)
returns table (student_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct gs.student_id
  from public.class_sessions s
  join public.teaching_assignments ta on ta.id = s.assignment_id
  join public.groups g on g.id = ta.group_id or g.parent_id = ta.group_id
  join public.group_students gs on gs.group_id = g.id
  join public.students st on st.id = gs.student_id and st.active
  where s.id = p_session;
$$;

create function private.random_digits6()
returns text language sql volatile set search_path = ''
as $$
  select lpad(
    ((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 1000000)::text, 6, '0')
  from (select extensions.gen_random_bytes(3) as b) r;
$$;

-- -----------------------------------------------------------------------------
-- Côté enseignant
-- -----------------------------------------------------------------------------

create function public.open_session(p_session_id uuid, p_minutes int default 15)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_try int := 0;
begin
  if not private.owns_session(p_session_id) then
    raise exception 'Séance introuvable ou accès refusé' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes not between 1 and 120 then
    raise exception 'Durée de pointage invalide (1 à 120 minutes)' using errcode = '22023';
  end if;

  loop
    begin
      update public.class_sessions
         set status = 'open',
             opened_at = now(),
             checkin_closes_at = now() + make_interval(mins => p_minutes),
             fallback_code = private.random_digits6()
       where id = p_session_id and status = 'planned';
      if not found then
        raise exception 'Seule une séance planifiée peut être ouverte' using errcode = 'P0001';
      end if;
      return;
    exception when unique_violation then
      -- Code de secours déjà utilisé par une autre séance ouverte : on retire.
      v_try := v_try + 1;
      if v_try > 10 then raise; end if;
    end;
  end loop;
end;
$$;

create function public.extend_checkin(p_session_id uuid, p_minutes int default 5)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_closes timestamptz;
begin
  if not private.owns_session(p_session_id) then
    raise exception 'Séance introuvable ou accès refusé' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes not between 1 and 60 then
    raise exception 'Prolongation invalide (1 à 60 minutes)' using errcode = '22023';
  end if;
  update public.class_sessions
     set checkin_closes_at = greatest(checkin_closes_at, now()) + make_interval(mins => p_minutes)
   where id = p_session_id and status = 'open'
  returning checkin_closes_at into v_closes;
  if v_closes is null then
    raise exception 'La séance n''est pas ouverte' using errcode = 'P0001';
  end if;
  return v_closes;
end;
$$;

-- Nouveau jeton QR (valable 45 s). Seul son hash est stocké.
create function public.rotate_session_token(p_session_id uuid)
returns table (token text, expires_at timestamptz, checkin_closes_at timestamptz, server_now timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_session record;
  v_token   text;
  v_expires timestamptz := now() + interval '45 seconds';
begin
  if not private.owns_session(p_session_id) then
    raise exception 'Séance introuvable ou accès refusé' using errcode = '42501';
  end if;
  select s.institution_id, s.status, s.checkin_closes_at into v_session
  from public.class_sessions s where s.id = p_session_id;
  if v_session.status <> 'open' or now() > v_session.checkin_closes_at then
    raise exception 'Le pointage est terminé pour cette séance' using errcode = 'P0001';
  end if;

  delete from public.session_tokens t
   where t.session_id = p_session_id and t.expires_at < now() - interval '1 minute';

  v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  insert into public.session_tokens (institution_id, session_id, token_hash, expires_at)
  values (v_session.institution_id, p_session_id, sha256(convert_to(v_token, 'UTF8')), v_expires);

  return query select v_token, v_expires, v_session.checkin_closes_at, now();
end;
$$;

-- Clôture : les étudiants attendus sans présence sont marqués absents.
create function public.close_session(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst    uuid;
  v_absents int;
begin
  if not private.owns_session(p_session_id) then
    raise exception 'Séance introuvable ou accès refusé' using errcode = '42501';
  end if;
  update public.class_sessions
     set status = 'closed', closed_at = now(), fallback_code = null
   where id = p_session_id and status = 'open'
  returning institution_id into v_inst;
  if v_inst is null then
    raise exception 'Seule une séance ouverte peut être clôturée' using errcode = 'P0001';
  end if;

  insert into public.attendance (institution_id, session_id, student_id, status, source)
  select v_inst, p_session_id, r.student_id, 'absent', 'cloture'
  from private.session_roster(p_session_id) r
  on conflict (session_id, student_id) do nothing;
  get diagnostics v_absents = row_count;

  delete from public.session_tokens where session_id = p_session_id;

  return jsonb_build_object(
    'absents', v_absents,
    'presents', (select count(*) from public.attendance a
                 where a.session_id = p_session_id and a.status = 'present')
  );
end;
$$;

-- Saisie ou correction manuelle (appel de secours, feuille papier, justificatif).
-- Une justification est TOUJOURS exigée ; elle est inscrite au journal d'audit.
create function public.set_attendance(p_session_id uuid, p_student_id uuid, p_status text, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_session record;
  v_reason  text := btrim(coalesce(p_reason, ''));
begin
  if not private.owns_session(p_session_id) then
    raise exception 'Séance introuvable ou accès refusé' using errcode = '42501';
  end if;
  if p_status not in ('present', 'absent', 'excuse') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'Une justification (3 à 500 caractères) est obligatoire' using errcode = '22023';
  end if;
  select s.institution_id, s.status into v_session from public.class_sessions s where s.id = p_session_id;
  if v_session.status not in ('open', 'closed') then
    raise exception 'La séance doit être ouverte ou clôturée' using errcode = 'P0001';
  end if;
  if not exists (select 1 from private.session_roster(p_session_id) r where r.student_id = p_student_id) then
    raise exception 'Cet étudiant n''est pas inscrit à cette séance' using errcode = 'P0001';
  end if;

  -- Lue par le trigger d'audit (valable pour cette transaction seulement).
  perform set_config('app.audit_reason', v_reason, true);

  insert into public.attendance (institution_id, session_id, student_id, status, source, updated_by, updated_at)
  values (v_session.institution_id, p_session_id, p_student_id, p_status, 'manuel', (select auth.uid()), now())
  on conflict (session_id, student_id) do update
    set status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    where public.attendance.status is distinct from excluded.status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Côté étudiant (appelé UNIQUEMENT par le serveur Next.js, clé secrète)
-- Les résultats sont renvoyés sous forme de code (et non d'erreur) afin que
-- chaque tentative, réussie ou non, soit journalisée pour la limitation.
-- -----------------------------------------------------------------------------

create function private.log_attempt(p_inst uuid, p_session uuid, p_ip text, p_device text, p_result text)
returns void language sql volatile security definer set search_path = ''
as $$
  insert into public.checkin_attempts (institution_id, session_id, ip_hash, device_ref, result)
  values (p_inst, p_session, left(p_ip, 128), left(p_device, 128), p_result);
$$;

-- Trop de tentatives ? (seuils larges par adresse IP : toute une salle peut
-- partager la même adresse via le Wi-Fi ou l'opérateur mobile)
create function private.is_rate_limited(p_ip text, p_device text, p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select
    (p_ip is not null and (
      select count(*) from public.checkin_attempts a
      where a.ip_hash = p_ip and a.created_at > now() - interval '10 minutes'
        and a.result not in ('ok', 'scan_ok')) >= 60)
    or (p_ip is not null and (
      select count(*) from public.checkin_attempts a
      where a.ip_hash = p_ip and a.created_at > now() - interval '10 minutes') >= 1500)
    or (p_device is not null and p_session is not null and (
      select count(*) from public.checkin_attempts a
      where a.device_ref = p_device and a.session_id = p_session
        and a.result in ('inconnu', 'limite')) >= 5);
$$;

-- Étape 1 : le QR (ou le code de secours) est-il valide MAINTENANT ?
create function public.validate_scan(
  p_public_code text, p_token text, p_fallback_code text, p_ip_hash text, p_device_ref text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_s      record;
  v_source text;
begin
  if private.is_rate_limited(p_ip_hash, p_device_ref, null) then
    perform private.log_attempt(null, null, p_ip_hash, p_device_ref, 'limite');
    return jsonb_build_object('result', 'limite');
  end if;

  if p_public_code is not null then
    select s.id, s.institution_id, s.status, s.checkin_closes_at into v_s
    from public.class_sessions s where s.public_code = p_public_code;
    v_source := 'qr';
  elsif p_fallback_code ~ '^[0-9]{6}$' then
    select s.id, s.institution_id, s.status, s.checkin_closes_at into v_s
    from public.class_sessions s where s.fallback_code = p_fallback_code and s.status = 'open';
    v_source := 'code_secours';
  end if;

  if v_s.id is null then
    perform private.log_attempt(null, null, p_ip_hash, p_device_ref, 'seance_introuvable');
    return jsonb_build_object('result', 'seance_introuvable');
  end if;
  if v_s.status <> 'open' or now() > v_s.checkin_closes_at then
    perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'pointage_ferme');
    return jsonb_build_object('result', 'pointage_ferme');
  end if;
  if v_source = 'qr' and not exists (
       select 1 from public.session_tokens t
       where t.session_id = v_s.id
         and t.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
         and t.expires_at > now()) then
    perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'jeton_expire');
    return jsonb_build_object('result', 'jeton_expire');
  end if;

  perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'scan_ok');
  return jsonb_build_object(
    'result', 'ok',
    'session_id', v_s.id,
    'source', v_source,
    'module', (select m.name from public.class_sessions s
               join public.teaching_assignments ta on ta.id = s.assignment_id
               join public.modules m on m.id = ta.module_id
               where s.id = v_s.id)
  );
end;
$$;

-- Étape 2 : enregistrement de la présence (le serveur a vérifié le passage
-- de l'étape 1 dans les 3 dernières minutes).
create function public.record_checkin(
  p_session_id uuid, p_source text, p_matricule text, p_ip_hash text, p_device_ref text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_s        record;
  v_mat      text := upper(regexp_replace(coalesce(p_matricule, ''), '\s', '', 'g'));
  v_student  record;
  v_id       uuid;
  v_at       timestamptz;
begin
  if p_source not in ('qr', 'code_secours') then
    raise exception 'Source invalide' using errcode = '22023';
  end if;

  select s.id, s.institution_id, s.status, s.checkin_closes_at into v_s
  from public.class_sessions s where s.id = p_session_id;
  if v_s.id is null then
    return jsonb_build_object('result', 'seance_introuvable');
  end if;

  if private.is_rate_limited(p_ip_hash, p_device_ref, v_s.id) then
    perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'limite');
    return jsonb_build_object('result', 'limite');
  end if;
  if v_s.status <> 'open' or now() > v_s.checkin_closes_at then
    perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'pointage_ferme');
    return jsonb_build_object('result', 'pointage_ferme');
  end if;

  select st.id, st.first_name, st.last_name into v_student
  from public.students st
  where st.institution_id = v_s.institution_id
    and st.matricule = v_mat
    and st.id in (select r.student_id from private.session_roster(v_s.id) r);
  if v_student.id is null then
    perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'inconnu');
    return jsonb_build_object('result', 'inconnu');
  end if;

  insert into public.attendance (institution_id, session_id, student_id, status, source, device_ref)
  values (v_s.institution_id, v_s.id, v_student.id, 'present', p_source, left(p_device_ref, 128))
  on conflict (session_id, student_id) do nothing
  returning id, recorded_at into v_id, v_at;

  if v_id is null then
    perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'deja_enregistre');
    return jsonb_build_object(
      'result', 'deja_enregistre',
      'recorded_at', (select a.recorded_at from public.attendance a
                      where a.session_id = v_s.id and a.student_id = v_student.id));
  end if;

  -- Même téléphone pour plusieurs matricules : on enregistre, mais on
  -- SIGNALE toutes les présences concernées à l'enseignant.
  if p_device_ref is not null then
    update public.attendance a
       set flags = array_append(a.flags, 'appareil_partage')
     where a.session_id = v_s.id
       and a.device_ref = left(p_device_ref, 128)
       and not ('appareil_partage' = any (a.flags))
       and (select count(*) from public.attendance b
            where b.session_id = v_s.id and b.device_ref = left(p_device_ref, 128)) > 1;
  end if;

  perform private.log_attempt(v_s.institution_id, v_s.id, p_ip_hash, p_device_ref, 'ok');
  return jsonb_build_object(
    'result', 'ok',
    'recorded_at', v_at,
    -- Affichage partiel du nom (confirmation sans exposer l'identité complète).
    'display', left(v_student.first_name, 1) || '. ' || left(v_student.last_name, 1) || '***'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function
  public.open_session(uuid, int),
  public.extend_checkin(uuid, int),
  public.rotate_session_token(uuid),
  public.close_session(uuid),
  public.set_attendance(uuid, uuid, text, text),
  public.validate_scan(text, text, text, text, text),
  public.record_checkin(uuid, text, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.open_session(uuid, int),
  public.extend_checkin(uuid, int),
  public.rotate_session_token(uuid),
  public.close_session(uuid),
  public.set_attendance(uuid, uuid, text, text)
to authenticated;

-- Pointage étudiant : uniquement le serveur (clé secrète).
grant execute on function
  public.validate_scan(text, text, text, text, text),
  public.record_checkin(uuid, text, text, text, text)
to service_role;

commit;
