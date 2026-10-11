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
