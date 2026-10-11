-- Tests de structure : RLS partout, droits retirés, contraintes SQL.
-- Données 100 % fictives.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- RLS et droits
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'La RLS est activée sur toutes les tables du schéma public'
);

select is_empty(
  $$ select table_name || ':' || privilege_type
     from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' $$,
  'Le rôle anon n''a aucun droit sur les tables de public'
);

select is_empty(
  $$ select table_name || ':' || privilege_type
     from information_schema.role_table_grants
     where grantee = 'authenticated'
       and table_name in ('session_tokens', 'checkin_attempts') $$,
  'authenticated n''a aucun droit sur session_tokens et checkin_attempts'
);

select is_empty(
  $$ select table_name || ':' || privilege_type
     from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and table_name in ('attendance', 'audit_log')
       and privilege_type <> 'SELECT' $$,
  'authenticated ne peut qu''effectuer des SELECT sur attendance et audit_log'
);

select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon ne peut exécuter aucune fonction de public'
);

select is_empty(
  $$ select p.pronamespace::regnamespace || '.' || p.proname from pg_proc p
     where p.prosecdef
       and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false) $$,
  'Toute fonction SECURITY DEFINER fixe son search_path'
);

-- ---------------------------------------------------------------------------
-- Contraintes (exécutées en superutilisateur : on teste la structure, pas la RLS)
-- ---------------------------------------------------------------------------

insert into public.institutions (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Université fictive A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Université fictive B');

insert into public.students (id, institution_id, matricule, last_name, first_name) values
  ('a0000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X0001', 'Fictif', 'Un'),
  ('b0000000-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'X0001', 'Fictif', 'Deux');
select pass('Un même matricule peut exister dans deux établissements différents');

select throws_ok(
  $$ insert into public.students (institution_id, matricule, last_name, first_name)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X0001', 'Doublon', 'Test') $$,
  '23505', null, 'Matricule en double dans le même établissement refusé'
);

select throws_ok(
  $$ insert into public.students (institution_id, matricule, last_name, first_name)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x 0002', 'Format', 'Invalide') $$,
  '23514', null, 'Matricule non normalisé (minuscules, espace) refusé'
);

select throws_ok(
  $$ insert into public.semesters (institution_id, label, start_date, end_date)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'S1', '2027-01-31', '2026-09-01') $$,
  '23514', null, 'Semestre dont la fin précède le début refusé'
);

insert into public.semesters (id, institution_id, label, start_date, end_date) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'S1', '2026-09-01', '2027-01-31');
insert into public.groups (id, institution_id, semester_id, name) values
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a0000000-0000-4000-8000-000000000001', 'G1');

select throws_ok(
  $$ insert into public.group_students (institution_id, group_id, student_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
             'a0000000-0000-4000-8000-000000000003',
             'b0000000-0000-4000-8000-000000000005') $$,
  '23503', null, 'Clé étrangère composite : un étudiant de B ne peut pas entrer dans un groupe de A'
);

select throws_ok(
  $$ insert into public.groups (institution_id, semester_id, name)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a0000000-0000-4000-8000-000000000001', 'G-B') $$,
  '23503', null, 'Clé étrangère composite : un groupe de B ne peut pas utiliser un semestre de A'
);

-- Affectation, séance, présence
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'enseignant.a@exemple.test');
insert into public.memberships (institution_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'enseignant');
insert into public.modules (id, institution_id, code, name) values
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BIO1', 'Biologie fictive');

select throws_ok(
  $$ insert into public.teaching_assignments (institution_id, teacher_id, module_id, group_id, session_type)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
             'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'td') $$,
  '23503', null, 'Une affectation dans B exige que l''enseignant soit membre de B'
);

insert into public.teaching_assignments (id, institution_id, teacher_id, module_id, group_id, session_type) values
  ('a0000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000003', 'td');

select throws_ok(
  $$ insert into public.class_sessions (institution_id, assignment_id, scheduled_at)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a0000000-0000-4000-8000-000000000007', now()) $$,
  '23503', null, 'Une séance de B ne peut pas pointer vers une affectation de A'
);

select throws_ok(
  $$ insert into public.class_sessions (institution_id, assignment_id, scheduled_at, status)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000007', now(), 'open') $$,
  '23514', null, 'Une séance « ouverte » doit avoir une heure d''ouverture'
);

insert into public.class_sessions (id, institution_id, assignment_id, scheduled_at, status, opened_at) values
  ('a0000000-0000-4000-8000-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a0000000-0000-4000-8000-000000000007', now(), 'open', now());

select matches(
  (select public_code from public.class_sessions where id = 'a0000000-0000-4000-8000-000000000008'),
  '^[A-Za-z0-9_-]{12}$',
  'Le code public de séance est généré automatiquement (12 caractères URL-safe)'
);

insert into public.attendance (institution_id, session_id, student_id, status, source) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008',
   'a0000000-0000-4000-8000-000000000005', 'present', 'qr');

select throws_ok(
  $$ insert into public.attendance (institution_id, session_id, student_id, status, source)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008',
             'a0000000-0000-4000-8000-000000000005', 'present', 'qr') $$,
  '23505', null, 'Deux présences pour le même étudiant dans la même séance : refusé'
);

select throws_ok(
  $$ insert into public.attendance (institution_id, session_id, student_id, status, source)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008',
             'b0000000-0000-4000-8000-000000000005', 'present', 'qr') $$,
  '23503', null, 'Présence d''un étudiant de B dans une séance de A : refusé'
);

select ok(
  (select recorded_at = now() from public.attendance
   where session_id = 'a0000000-0000-4000-8000-000000000008'),
  'L''heure de présence est fixée par le serveur (now())'
);

-- ---------------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from public.audit_log
          where table_name = 'attendance' and action = 'INSERT'
            and session_id = 'a0000000-0000-4000-8000-000000000008'),
  'L''insertion d''une présence est journalisée automatiquement avec sa séance'
);

select throws_ok(
  $$ update public.audit_log set reason = 'falsifié' $$,
  'P0001', null, 'Le journal d''audit ne peut pas être modifié (même par un superutilisateur)'
);

select throws_ok(
  $$ delete from public.audit_log $$,
  'P0001', null, 'Le journal d''audit ne peut pas être supprimé hors procédure de purge'
);

-- ---------------------------------------------------------------------------
-- Profils et garde-fou « dernier admin »
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Un profil est créé automatiquement à l''inscription'
);

insert into public.memberships (institution_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin');

select throws_ok(
  $$ delete from public.memberships
     where user_id = '11111111-1111-4111-8111-111111111111' and role = 'admin' $$,
  'P0001', null, 'Le dernier admin actif ne peut pas être retiré'
);

select throws_ok(
  $$ update public.memberships set status = 'disabled'
     where user_id = '11111111-1111-4111-8111-111111111111' and role = 'admin' $$,
  'P0001', null, 'Le dernier admin actif ne peut pas être désactivé'
);

select * from finish();
rollback;
