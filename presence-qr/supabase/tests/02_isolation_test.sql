-- Tests d'isolation : on se connecte sous différentes identités (en simulant
-- le jeton JWT de Supabase, exactement comme le fait l'API) et on vérifie ce
-- que chacun peut voir et modifier.
--
-- Établissement A : adminA (admin + enseignant, groupe G2),
--                   teacherA (enseignant seulement, groupe G1).
-- Établissement B : adminB (admin + enseignant).
-- outsider : connecté mais membre de rien.
-- Données 100 % fictives.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- ---------------------------------------------------------------------------
-- Outils de connexion simulée
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

-- ---------------------------------------------------------------------------
-- Données fictives (créées en superutilisateur)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'admin.a@exemple.test',   '{"full_name":"Admin A"}'),
  ('22222222-2222-4222-8222-222222222222', 'prof.a@exemple.test',    '{"full_name":"Prof A"}'),
  ('33333333-3333-4333-8333-333333333333', 'admin.b@exemple.test',   '{"full_name":"Admin B"}'),
  ('44444444-4444-4444-8444-444444444444', 'externe@exemple.test',   '{"full_name":"Externe"}');

insert into public.institutions (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Université fictive A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Université fictive B');

insert into public.memberships (institution_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'enseignant'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'enseignant'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'enseignant');

insert into public.departments (id, institution_id, name) values
  ('a0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Biologie'),
  ('b0000000-0000-4000-8000-0000000000d1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Chimie');

insert into public.semesters (id, institution_id, label, start_date, end_date) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'S1', '2026-09-01', '2027-01-31'),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'S1', '2026-09-01', '2027-01-31');

insert into public.modules (id, institution_id, code, name) values
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BIO1', 'Biologie fictive'),
  ('a0000000-0000-4000-8000-0000000000f2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'GEN1', 'Génétique fictive'),
  ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'CHM1', 'Chimie fictive');

insert into public.groups (id, institution_id, semester_id, name) values
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G1'),
  ('a0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G2'),
  ('b0000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 'G1');

insert into public.students (id, institution_id, matricule, last_name, first_name) values
  ('a0000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A0001', 'Fictif', 'Alpha'),
  ('a0000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A0002', 'Fictif', 'Beta'),
  ('b0000000-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B0001', 'Fictif', 'Gamma');

insert into public.group_students (institution_id, group_id, student_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000006'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000005');

insert into public.teaching_assignments (id, institution_id, teacher_id, module_id, group_id, session_type) values
  -- teacherA → BIO1 / G1
  ('a0000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'td'),
  -- adminA → GEN1 / G2
  ('a0000000-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-0000000000f2', 'a0000000-0000-4000-8000-000000000004', 'cours'),
  -- adminB → CHM1 / G1 de B
  ('b0000000-0000-4000-8000-000000000007', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333',
   'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'td');

insert into public.class_sessions (id, institution_id, assignment_id, scheduled_at, status, opened_at) values
  ('a0000000-0000-4000-8000-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000007', now(), 'open', now()),
  ('a0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009', now(), 'open', now()),
  ('b0000000-0000-4000-8000-000000000008', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000007', now(), 'open', now());

insert into public.session_tokens (institution_id, session_id, token_hash, expires_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008', sha256('jeton-fictif-a'), now() + interval '45 seconds');

insert into public.attendance (institution_id, session_id, student_id, status, source) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000005', 'present', 'qr'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000006', 'present', 'qr'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000005', 'present', 'qr');

insert into public.checkin_attempts (institution_id, session_id, ip_hash, result) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008', 'hash-fictif', 'ok');

-- ===========================================================================
-- 1. Visiteur anonyme (clé publique, pas de connexion) — ex. un étudiant
-- ===========================================================================
select tests.login_anon();

select throws_ok($$ select * from public.students $$, '42501', null, 'anon : lecture des étudiants refusée');
select throws_ok($$ select * from public.attendance $$, '42501', null, 'anon : lecture des présences refusée');
select throws_ok($$ select * from public.institutions $$, '42501', null, 'anon : lecture des établissements refusée');
select throws_ok($$ select * from public.session_tokens $$, '42501', null, 'anon : lecture des jetons refusée');
select throws_ok($$ insert into public.attendance (institution_id, session_id, student_id, status, source)
                    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008',
                            'a0000000-0000-4000-8000-000000000006', 'present', 'qr') $$,
  '42501', null, 'anon : insertion directe d''une présence refusée');
select throws_ok($$ select public.create_workspace('Pirate') $$, '42501', null, 'anon : create_workspace refusé');

reset role;

-- ===========================================================================
-- 2. adminB tente d'accéder à l'établissement A (accès croisé)
-- ===========================================================================
select tests.login_as('33333333-3333-4333-8333-333333333333');

select is((select count(*)::int from public.institutions), 1, 'adminB : ne voit que son établissement');
select is((select count(*)::int from public.institutions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : A invisible');
select is((select count(*)::int from public.memberships where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : membres de A invisibles');
select is((select count(*)::int from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 0, 'adminB : profil de adminA invisible');
select is((select count(*)::int from public.departments where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : départements de A invisibles');
select is((select count(*)::int from public.semesters where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : semestres de A invisibles');
select is((select count(*)::int from public.modules where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : modules de A invisibles');
select is((select count(*)::int from public.groups where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : groupes de A invisibles');
select is((select count(*)::int from public.students where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : étudiants de A invisibles');
select is((select count(*)::int from public.group_students where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : inscriptions de A invisibles');
select is((select count(*)::int from public.teaching_assignments where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : affectations de A invisibles');
select is((select count(*)::int from public.class_sessions where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : séances de A invisibles');
select is((select count(*)::int from public.attendance where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : présences de A invisibles');
select is((select count(*)::int from public.audit_log where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'adminB : audit de A invisible');
select throws_ok($$ select * from public.session_tokens $$, '42501', null, 'adminB : jetons QR inaccessibles');
select throws_ok($$ select * from public.checkin_attempts $$, '42501', null, 'adminB : tentatives de pointage inaccessibles');

-- Contrôle positif : adminB voit bien ses propres données.
select is((select count(*)::int from public.students), 1, 'adminB : voit l''étudiant de B');
select is((select count(*)::int from public.attendance), 1, 'adminB : voit la présence de B');

-- Écritures croisées
with u as (update public.institutions set name = 'Piratée'
              where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
select is(count(*)::int, 0, 'adminB : ne peut pas renommer A') from u;
with d as (delete from public.students
              where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
select is(count(*)::int, 0, 'adminB : ne peut pas supprimer les étudiants de A') from d;
with u as (update public.memberships set status = 'disabled'
              where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
select is(count(*)::int, 0, 'adminB : ne peut pas désactiver les membres de A') from u;
select throws_ok(
  $$ insert into public.memberships (institution_id, user_id, role)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'admin') $$,
  '42501', null, 'adminB : ne peut pas se nommer admin de A');
select throws_ok(
  $$ insert into public.students (institution_id, matricule, last_name, first_name)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PIRATE1', 'Pirate', 'Test') $$,
  '42501', null, 'adminB : ne peut pas créer d''étudiant dans A');
select throws_ok(
  $$ insert into public.departments (institution_id, name)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pirate') $$,
  '42501', null, 'adminB : ne peut pas créer de département dans A');
select throws_ok(
  $$ insert into public.group_students (institution_id, group_id, student_id)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000003',
             'a0000000-0000-4000-8000-000000000005') $$,
  '23503', null, 'adminB : ne peut pas inscrire un étudiant de A dans un groupe de B');
select throws_ok(
  $$ insert into public.teaching_assignments (institution_id, teacher_id, module_id, group_id, session_type)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
             'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'tp') $$,
  '23503', null, 'adminB : ne peut pas affecter un enseignant qui n''est pas membre de B');
select throws_ok(
  $$ insert into public.class_sessions (institution_id, assignment_id, scheduled_at)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000007', now()) $$,
  '42501', null, 'adminB : ne peut pas créer de séance sur une affectation de A');

reset role;

-- Vérification en superutilisateur : rien n'a changé dans A.
select is((select name from public.institutions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'Université fictive A', 'A n''a pas été renommé');
select is((select count(*)::int from public.students where institution_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  2, 'Les étudiants de A sont intacts');

-- ===========================================================================
-- 3. teacherA (enseignant simple) : ne voit que ses groupes et séances
-- ===========================================================================
select tests.login_as('22222222-2222-4222-8222-222222222222');

select is((select count(*)::int from public.institutions), 1, 'teacherA : voit son établissement');
select is((select count(*)::int from public.memberships), 1, 'teacherA : ne voit que sa propre appartenance');
select is((select count(*)::int from public.profiles), 1, 'teacherA : ne voit que son propre profil');
select is((select count(*)::int from public.semesters), 1, 'teacherA : voit les semestres de son établissement');
select is((select count(*)::int from public.departments), 1, 'teacherA : voit les départements de son établissement');
select results_eq($$ select id from public.groups $$,
  $$ values ('a0000000-0000-4000-8000-000000000003'::uuid) $$, 'teacherA : ne voit que le groupe G1');
select results_eq($$ select id from public.modules $$,
  $$ values ('a0000000-0000-4000-8000-000000000002'::uuid) $$, 'teacherA : ne voit que son module');
select results_eq($$ select id from public.students $$,
  $$ values ('a0000000-0000-4000-8000-000000000005'::uuid) $$, 'teacherA : ne voit que les étudiants de G1');
select is((select count(*)::int from public.teaching_assignments), 1, 'teacherA : ne voit que son affectation');
select results_eq($$ select id from public.class_sessions $$,
  $$ values ('a0000000-0000-4000-8000-000000000008'::uuid) $$, 'teacherA : ne voit que sa séance');
select is((select count(*)::int from public.attendance), 1, 'teacherA : ne voit que les présences de sa séance');
select is((select count(*)::int from public.audit_log
           where session_id is distinct from 'a0000000-0000-4000-8000-000000000008'), 0,
  'teacherA : l''audit visible ne concerne que sa séance');
select ok((select count(*) from public.audit_log) > 0, 'teacherA : voit l''audit de sa séance');

select throws_ok($$ select * from public.session_tokens $$, '42501', null, 'teacherA : jetons QR non lisibles directement');
select throws_ok(
  $$ insert into public.students (institution_id, matricule, last_name, first_name)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A0099', 'Ajout', 'Direct') $$,
  '42501', null, 'teacherA : ne peut pas créer d''étudiant directement');
select throws_ok(
  $$ insert into public.attendance (institution_id, session_id, student_id, status, source)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000008',
             'a0000000-0000-4000-8000-000000000006', 'present', 'manuel') $$,
  '42501', null, 'teacherA : ne peut pas insérer de présence directement');
select throws_ok(
  $$ update public.attendance set status = 'absent' $$,
  '42501', null, 'teacherA : ne peut pas modifier une présence directement (correction via fonction)');
select throws_ok(
  $$ delete from public.attendance $$,
  '42501', null, 'teacherA : ne peut pas supprimer de présence');
select throws_ok(
  $$ update public.class_sessions set status = 'closed', closed_at = now() $$,
  '42501', null, 'teacherA : ne peut pas changer le statut d''une séance directement');
with u as (update public.groups set name = 'Renommé' returning 1)
select is(count(*)::int, 0, 'teacherA : ne peut pas renommer un groupe (0 ligne modifiée)') from u;
with u as (update public.memberships set status = 'active' returning 1)
select is(count(*)::int, 0, 'teacherA : ne peut pas modifier son appartenance') from u;
select throws_ok(
  $$ insert into public.memberships (institution_id, user_id, role)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin') $$,
  '42501', null, 'teacherA : ne peut pas se promouvoir admin');
select throws_ok(
  $$ insert into public.class_sessions (institution_id, assignment_id, scheduled_at)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000009', now()) $$,
  '42501', null, 'teacherA : ne peut pas créer de séance sur l''affectation d''un collègue');
select lives_ok(
  $$ insert into public.class_sessions (institution_id, assignment_id, scheduled_at, room)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000007',
             now() + interval '1 day', 'Salle 12') $$,
  'teacherA : peut planifier une séance sur sa propre affectation');
select is(
  (select created_by from public.class_sessions where room = 'Salle 12'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'created_by est imposé par la base (pas par le client)');
select throws_ok(
  $$ insert into public.class_sessions (institution_id, assignment_id, scheduled_at, status, opened_at)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000007', now(), 'open', now()) $$,
  '42501', null, 'teacherA : ne peut pas créer une séance déjà « ouverte » (colonne status non accordée)');

reset role;

-- ===========================================================================
-- 4. adminA : voit tout A, rien de B
-- ===========================================================================
select tests.login_as('11111111-1111-4111-8111-111111111111');

select is((select count(*)::int from public.groups), 2, 'adminA : voit tous les groupes de A');
select is((select count(*)::int from public.students), 2, 'adminA : voit tous les étudiants de A');
select is((select count(*)::int from public.class_sessions), 3, 'adminA : voit toutes les séances de A');
select is((select count(*)::int from public.attendance), 2, 'adminA : voit toutes les présences de A');
select is((select count(*)::int from public.memberships), 3, 'adminA : voit les membres de A');
select is((select count(*)::int from public.profiles), 2, 'adminA : voit les profils des membres de A');
select is((select count(*)::int from public.audit_log where institution_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'adminA : aucune ligne d''audit d''un autre établissement');
select throws_ok($$ update public.audit_log set reason = 'x' $$, '42501', null, 'adminA : ne peut pas modifier le journal d''audit');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'adminA : ne peut pas supprimer le journal d''audit');
select throws_ok(
  $$ delete from public.memberships
     where user_id = '11111111-1111-4111-8111-111111111111' and role = 'admin' $$,
  'P0001', null, 'adminA : ne peut pas retirer le dernier admin');

-- adminA désactive teacherA : l'accès de teacherA doit disparaître immédiatement.
select lives_ok(
  $$ update public.memberships set status = 'disabled'
     where user_id = '22222222-2222-4222-8222-222222222222' $$,
  'adminA : peut désactiver un enseignant de A');

reset role;
select tests.login_as('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.institutions), 0, 'teacherA désactivé : ne voit plus l''établissement');
select is((select count(*)::int from public.groups), 0, 'teacherA désactivé : ne voit plus de groupe');
select is((select count(*)::int from public.students), 0, 'teacherA désactivé : ne voit plus d''étudiant');
select is((select count(*)::int from public.class_sessions), 0, 'teacherA désactivé : ne voit plus de séance');
select is((select count(*)::int from public.attendance), 0, 'teacherA désactivé : ne voit plus de présence');
reset role;

-- ===========================================================================
-- 5. outsider : connecté, membre de rien ; création d'espace de travail
-- ===========================================================================
select tests.login_as('44444444-4444-4444-8444-444444444444');

select is((select count(*)::int from public.institutions), 0, 'outsider : ne voit aucun établissement');
select is((select count(*)::int from public.students), 0, 'outsider : ne voit aucun étudiant');
select is((select count(*)::int from public.attendance), 0, 'outsider : ne voit aucune présence');

select lives_ok($$ select public.create_workspace('Mon espace fictif') $$, 'outsider : peut créer son espace de travail');
select is((select count(*)::int from public.institutions), 1, 'outsider : voit son nouvel espace');
select results_eq(
  $$ select role from public.memberships order by role $$,
  $$ values ('admin'::text), ('enseignant'::text) $$,
  'outsider : devient admin et enseignant de son espace');
select is((select count(*)::int from public.students), 0, 'outsider : ne voit toujours aucun étudiant de A ou B');

select lives_ok($$ select public.create_workspace('Deuxième espace') $$, 'outsider : 2e espace autorisé');
select lives_ok($$ select public.create_workspace('Troisième espace') $$, 'outsider : 3e espace autorisé');
select throws_ok($$ select public.create_workspace('Quatrième espace') $$, 'P0001', null,
  'outsider : 4e espace refusé (limite anti-abus)');

reset role;

select * from finish();
rollback;
