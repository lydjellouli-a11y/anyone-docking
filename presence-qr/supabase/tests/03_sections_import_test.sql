-- Tests phase 4 : sections, import d'étudiants, annulation de séance.
-- Établissement A : adminA ; profCours (cours de la section S1) ;
--                   profTD (TD du groupe G1 uniquement).
-- Établissement B : adminB.  Données 100 % fictives.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin.a@exemple.test'),
  ('22222222-2222-4222-8222-222222222222', 'cours.a@exemple.test'),
  ('55555555-5555-4555-8555-555555555555', 'td.a@exemple.test'),
  ('33333333-3333-4333-8333-333333333333', 'admin.b@exemple.test');

insert into public.institutions (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Université fictive A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Université fictive B');

insert into public.memberships (institution_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'enseignant'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'enseignant'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'admin');

insert into public.semesters (id, institution_id, label, start_date, end_date) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'S1', '2026-09-01', '2027-01-31'),
  ('a0000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'S2', '2027-02-01', '2027-06-30'),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'S1', '2026-09-01', '2027-01-31');

insert into public.modules (id, institution_id, code, name) values
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CYTO', 'Cytologie fictive');

-- Section S1 avec G1, G2, G3 ; un « G1 » existe aussi dans la section S2.
insert into public.groups (id, institution_id, semester_id, name, kind, parent_id) values
  ('a0000000-0000-4000-8000-0000000000a0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'L1 Section 1', 'section', null),
  ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G1', 'groupe', 'a0000000-0000-4000-8000-0000000000a0'),
  ('a0000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G2', 'groupe', 'a0000000-0000-4000-8000-0000000000a0'),
  ('a0000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G3', 'groupe', 'a0000000-0000-4000-8000-0000000000a0'),
  ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'L1 Section 2', 'section', null),
  ('b0000000-0000-4000-8000-0000000000a1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 'G1', 'groupe', null);

select lives_ok(
  $$ insert into public.groups (institution_id, semester_id, name, parent_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G1',
             'a0000000-0000-4000-8000-0000000000b0') $$,
  'Le nom « G1 » peut exister dans deux sections du même semestre');
select throws_ok(
  $$ insert into public.groups (institution_id, semester_id, name, parent_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G1',
             'a0000000-0000-4000-8000-0000000000a0') $$,
  '23505', null, 'Deux « G1 » dans la même section : refusé');
select throws_ok(
  $$ insert into public.groups (institution_id, semester_id, name, parent_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'Sous-G1',
             'a0000000-0000-4000-8000-0000000000a1') $$,
  '23514', null, 'Un groupe ne peut pas être rattaché à un autre groupe (seulement à une section)');
select throws_ok(
  $$ insert into public.groups (institution_id, semester_id, name, parent_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000e1', 'G9',
             'a0000000-0000-4000-8000-0000000000a0') $$,
  '23514', null, 'Un groupe et sa section doivent être du même semestre');
select throws_ok(
  $$ insert into public.groups (institution_id, semester_id, name, parent_id)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 'G9',
             'a0000000-0000-4000-8000-0000000000a0') $$,
  '23503', null, 'Un groupe de B ne peut pas être rattaché à une section de A');
select throws_ok(
  $$ update public.groups set kind = 'groupe' where id = 'a0000000-0000-4000-8000-0000000000a0' $$,
  '23514', null, 'Une section contenant des groupes ne peut pas redevenir un groupe');

insert into public.teaching_assignments (id, institution_id, teacher_id, module_id, group_id, session_type) values
  -- profCours : cours magistral pour toute la section
  ('a0000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a0', 'cours'),
  -- profTD : TD du groupe G1 seulement
  ('a0000000-0000-4000-8000-0000000000c2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555',
   'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', 'td');

-- ===========================================================================
-- Import par l'admin
-- ===========================================================================
select tests.login_as('11111111-1111-4111-8111-111111111111');

select is(
  public.import_students('a0000000-0000-4000-8000-0000000000a1',
    '[{"matricule":" 2026 0001 ","nom":"Fictif","prenom":"Alpha"},
      {"matricule":"20260002","nom":"Fictif","prenom":"Beta"}]'::jsonb),
  '{"crees":2,"ajoutes":2,"deja_presents":0,"noms_differents":[]}'::jsonb,
  'Import dans G1 : 2 étudiants créés et ajoutés (matricule normalisé)');

select is((select matricule from public.students where last_name = 'Fictif' and first_name = 'Alpha'),
  '20260001', 'Le matricule est normalisé (espaces retirés)');

select is(
  public.import_students('a0000000-0000-4000-8000-0000000000a1',
    '[{"matricule":"20260001","nom":"Fictif","prenom":"Alpha"}]'::jsonb),
  '{"crees":0,"ajoutes":0,"deja_presents":1,"noms_differents":[]}'::jsonb,
  'Réimport du même fichier : rien n''est dupliqué');

select is(
  public.import_students('a0000000-0000-4000-8000-0000000000a3',
    '[{"matricule":"20260002","nom":"Autre","prenom":"Nom"},
      {"matricule":"20260003","nom":"Fictif","prenom":"Gamma"}]'::jsonb),
  '{"crees":1,"ajoutes":2,"deja_presents":0,
    "noms_differents":[{"matricule":"20260002","enregistre":"Fictif Beta","fichier":"Autre Nom"}]}'::jsonb,
  'Matricule déjà connu avec un autre nom : signalé, non écrasé');
select is((select last_name from public.students where matricule = '20260002'), 'Fictif',
  'Le nom existant n''a pas été écrasé');

select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000a2',
       '[{"matricule":"20260010","nom":"Ok","prenom":"Ok"},
         {"matricule":"x","nom":"","prenom":"Invalide"}]'::jsonb) $$,
  '22023', null, 'Une ligne invalide annule tout l''import');
select is((select count(*)::int from public.students where matricule = '20260010'), 0,
  'Tout ou rien : la ligne valide n''a pas été importée non plus');

select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000a2', '[]'::jsonb) $$,
  '22023', null, 'Liste vide refusée');
select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000a2',
       (select jsonb_agg(jsonb_build_object('matricule', 'M' || lpad(i::text, 5, '0'), 'nom', 'N', 'prenom', 'P'))
        from generate_series(1, 2001) i)) $$,
  '22023', null, 'Plus de 2000 lignes refusé');

reset role;

-- ===========================================================================
-- Visibilité : enseignant de cours (section) vs enseignant de TD (G1)
-- ===========================================================================
select tests.login_as('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.students), 3,
  'Enseignant du cours de section : voit les étudiants de tous les groupes de la section');
select is((select count(*)::int from public.groups where parent_id = 'a0000000-0000-4000-8000-0000000000a0'), 3,
  'Enseignant du cours de section : voit les groupes de la section');
select lives_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000a2',
       '[{"matricule":"20260004","nom":"Fictif","prenom":"Delta"}]'::jsonb) $$,
  'Enseignant du cours de section : peut importer dans un groupe de sa section');
select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000b0',
       '[{"matricule":"20260005","nom":"Fictif","prenom":"Epsilon"}]'::jsonb) $$,
  '42501', null, 'Enseignant du cours de section : ne peut pas importer dans une autre section');
reset role;

select tests.login_as('55555555-5555-4555-8555-555555555555');
select results_eq(
  $$ select matricule from public.students order by matricule $$,
  $$ values ('20260001'::text), ('20260002'::text) $$,
  'Enseignant de TD G1 : ne voit que les étudiants de G1');
select is((select count(*)::int from public.groups), 1, 'Enseignant de TD G1 : ne voit que G1');
select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000a3',
       '[{"matricule":"20260006","nom":"Fictif","prenom":"Zeta"}]'::jsonb) $$,
  '42501', null, 'Enseignant de TD G1 : ne peut pas importer dans G3');
select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000a0',
       '[{"matricule":"20260006","nom":"Fictif","prenom":"Zeta"}]'::jsonb) $$,
  '42501', null, 'Enseignant de TD G1 : ne peut pas importer dans la section');
reset role;

-- ===========================================================================
-- Accès croisé : adminB contre A
-- ===========================================================================
select tests.login_as('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-0000000000a1',
       '[{"matricule":"PIRATE01","nom":"Pirate","prenom":"Test"}]'::jsonb) $$,
  '42501', null, 'adminB : ne peut pas importer dans un groupe de A');
select throws_ok(
  $$ select public.import_students('a0000000-0000-4000-8000-00000000dead',
       '[{"matricule":"PIRATE01","nom":"Pirate","prenom":"Test"}]'::jsonb) $$,
  '42501', null, 'Groupe inexistant : même message que « accès refusé »');
reset role;
select is((select count(*)::int from public.students where matricule = 'PIRATE01'), 0,
  'Aucun étudiant pirate créé');

-- ===========================================================================
-- Annulation de séance
-- ===========================================================================
insert into public.class_sessions (id, institution_id, assignment_id, scheduled_at) values
  ('a0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000c2', now() + interval '2 days');

select tests.login_as('22222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ select public.cancel_session('a0000000-0000-4000-8000-0000000000d1') $$,
  '42501', null, 'Un collègue ne peut pas annuler la séance d''un autre');
reset role;

select tests.login_as('55555555-5555-4555-8555-555555555555');
select lives_ok($$ select public.cancel_session('a0000000-0000-4000-8000-0000000000d1') $$,
  'L''enseignant annule sa séance planifiée');
select is((select status from public.class_sessions where id = 'a0000000-0000-4000-8000-0000000000d1'),
  'cancelled', 'La séance est annulée');
select throws_ok(
  $$ select public.cancel_session('a0000000-0000-4000-8000-0000000000d1') $$,
  'P0001', null, 'Une séance déjà annulée ne peut pas être annulée à nouveau');
reset role;

select ok(
  exists (select 1 from public.audit_log where table_name = 'group_students' and action = 'INSERT'),
  'Les inscriptions dans les groupes sont journalisées');

select * from finish();
rollback;
