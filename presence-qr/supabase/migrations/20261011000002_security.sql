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
