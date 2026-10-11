-- Tests phase 5 : ouverture, QR tournant, pointage, clôture, corrections.
-- Établissement A : prof (TD du groupe G1 : 2 étudiants ; G2 a 1 étudiant).
--                   collegue (autre enseignant de A, sans lien avec la séance).
-- Établissement B : adminB.  Données 100 % fictives.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;
-- Variables partagées entre les étapes du test.
create table tests.vars (k text primary key, v text);
grant all on tests.vars to authenticated, service_role;

insert into auth.users (id, email) values
  ('22222222-2222-4222-8222-222222222222', 'prof.a@exemple.test'),
  ('66666666-6666-4666-8666-666666666666', 'collegue.a@exemple.test'),
  ('33333333-3333-4333-8333-333333333333', 'admin.b@exemple.test');
insert into public.institutions (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Université fictive A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Université fictive B');
insert into public.memberships (institution_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'enseignant'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'enseignant'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'enseignant');
insert into public.semesters (id, institution_id, label, start_date, end_date) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'S1', '2026-09-01', '2027-01-31');
insert into public.modules (id, institution_id, code, name) values
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CYTO', 'Cytologie fictive');
insert into public.groups (id, institution_id, semester_id, name) values
  ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G1'),
  ('a0000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G2');
insert into public.students (id, institution_id, matricule, last_name, first_name) values
  ('a0000000-0000-4000-8000-000000000051', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20260001', 'Fictif', 'Amina'),
  ('a0000000-0000-4000-8000-000000000052', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20260002', 'Fictif', 'Bilal'),
  ('a0000000-0000-4000-8000-000000000053', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20260003', 'Fictif', 'Chahinez');
insert into public.group_students (institution_id, group_id, student_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000051'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000052'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-000000000053');
insert into public.teaching_assignments (id, institution_id, teacher_id, module_id, group_id, session_type) values
  ('a0000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', 'td');
insert into public.class_sessions (id, institution_id, assignment_id, scheduled_at, public_code) values
  ('a0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000c1', now(), 'CODEPUBLIC01');

-- ===========================================================================
-- Droits : le pointage n'est pas appelable avec la clé publique
-- ===========================================================================
select ok(not has_function_privilege('anon', 'public.record_checkin(uuid, text, text, text, text)', 'execute'),
  'anon ne peut pas appeler record_checkin');
select ok(not has_function_privilege('authenticated', 'public.record_checkin(uuid, text, text, text, text)', 'execute'),
  'authenticated ne peut pas appeler record_checkin');
select ok(not has_function_privilege('authenticated', 'public.validate_scan(text, text, text, text, text)', 'execute'),
  'authenticated ne peut pas appeler validate_scan');
select ok(has_function_privilege('service_role', 'public.record_checkin(uuid, text, text, text, text)', 'execute'),
  'service_role (serveur) peut appeler record_checkin');
select ok(not has_function_privilege('anon', 'public.open_session(uuid, int)', 'execute'),
  'anon ne peut pas ouvrir de séance');

-- ===========================================================================
-- Ouverture et QR
-- ===========================================================================
select tests.as_service();
select is(public.validate_scan('CODEPUBLIC01', 'x', null, 'ip1', 'dev0') ->> 'result', 'pointage_ferme',
  'Séance non ouverte : scan refusé');
reset role;

select tests.login_as('66666666-6666-4666-8666-666666666666');
select throws_ok($$ select public.open_session('a0000000-0000-4000-8000-0000000000d1') $$, '42501', null,
  'Un collègue ne peut pas ouvrir la séance');
reset role;
select tests.login_as('33333333-3333-4333-8333-333333333333');
select throws_ok($$ select public.open_session('a0000000-0000-4000-8000-0000000000d1') $$, '42501', null,
  'adminB ne peut pas ouvrir une séance de A');
select throws_ok($$ select * from public.rotate_session_token('a0000000-0000-4000-8000-0000000000d1') $$, '42501', null,
  'adminB ne peut pas obtenir de jeton QR de A');
reset role;

select tests.login_as('22222222-2222-4222-8222-222222222222');
select throws_ok($$ select * from public.rotate_session_token('a0000000-0000-4000-8000-0000000000d1') $$, 'P0001', null,
  'Pas de jeton QR avant l''ouverture');
select lives_ok($$ select public.open_session('a0000000-0000-4000-8000-0000000000d1', 15) $$,
  'L''enseignant ouvre sa séance (15 minutes)');
select ok((select status = 'open' and checkin_closes_at = now() + interval '15 minutes' and fallback_code ~ '^[0-9]{6}$'
           from public.class_sessions where id = 'a0000000-0000-4000-8000-0000000000d1'),
  'Séance ouverte : fin du pointage à +15 min, code de secours à 6 chiffres');
select throws_ok($$ select public.open_session('a0000000-0000-4000-8000-0000000000d1') $$, 'P0001', null,
  'Une séance déjà ouverte ne peut pas être rouverte');

insert into tests.vars select 'token', token from public.rotate_session_token('a0000000-0000-4000-8000-0000000000d1');
insert into tests.vars select 'code', fallback_code from public.class_sessions where id = 'a0000000-0000-4000-8000-0000000000d1';
select ok((select length(v) >= 20 from tests.vars where k = 'token'), 'Un jeton QR aléatoire est fourni à l''enseignant');
reset role;

select is((select count(*)::int from public.session_tokens
           where token_hash = sha256(convert_to((select v from tests.vars where k = 'token'), 'UTF8'))), 1,
  'Seul le hash du jeton est stocké');
select is((select count(*)::int from public.session_tokens
           where octet_length(token_hash) <> 32
              or token_hash = convert_to((select v from tests.vars where k = 'token'), 'UTF8')), 0,
  'Le jeton n''est pas stocké en clair (uniquement des hash SHA-256 de 32 octets)');

-- ===========================================================================
-- Scan et pointage (en tant que serveur)
-- ===========================================================================
select tests.as_service();

select is(public.validate_scan('CODEPUBLIC01', 'jeton-invente', null, 'ip1', 'dev1') ->> 'result', 'jeton_expire',
  'Jeton inventé : refusé');
select is(public.validate_scan('INCONNU00000', (select v from tests.vars where k = 'token'), null, 'ip1', 'dev1') ->> 'result',
  'seance_introuvable', 'Code de séance inconnu : refusé');
select is(public.validate_scan('CODEPUBLIC01', (select v from tests.vars where k = 'token'), null, 'ip1', 'dev1') ->> 'result',
  'ok', 'Jeton valide : scan accepté');
select is(public.validate_scan(null, null, (select v from tests.vars where k = 'code'), 'ip1', 'dev1') ->> 'source',
  'code_secours', 'Code de secours à 6 chiffres : accepté');

select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'qr', ' 2026 0001 ', 'ip1', 'dev1'),
  jsonb_build_object('result', 'ok', 'recorded_at', now(), 'display', 'A. F***'),
  'Pointage accepté : heure du serveur, nom affiché partiellement');
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'qr', '20260001', 'ip1', 'dev1') ->> 'result',
  'deja_enregistre', 'Deuxième pointage du même étudiant : doublon détecté');
select is((select count(*)::int from public.attendance where session_id = 'a0000000-0000-4000-8000-0000000000d1'), 1,
  'Une seule présence enregistrée malgré le doublon');
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'qr', '20260003', 'ip1', 'dev2') ->> 'result',
  'inconnu', 'Étudiant d''un autre groupe : refusé (même message qu''un matricule inconnu)');
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'qr', '99999999', 'ip1', 'dev2') ->> 'result',
  'inconnu', 'Matricule inexistant : refusé');

-- Même téléphone pour un second matricule : enregistré mais signalé.
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'code_secours', '20260002', 'ip1', 'dev1') ->> 'result',
  'ok', 'Second matricule depuis le même appareil : enregistré');
reset role;
select is((select count(*)::int from public.attendance
           where session_id = 'a0000000-0000-4000-8000-0000000000d1' and 'appareil_partage' = any (flags)), 2,
  'Les deux présences issues du même appareil sont signalées');
select is((select source from public.attendance where student_id = 'a0000000-0000-4000-8000-000000000052'),
  'code_secours', 'La source (code de secours) est enregistrée');

-- Limitation : un appareil qui essaie des matricules au hasard est bloqué
-- après 5 échecs sur la séance.
select tests.as_service();
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'qr', 'X' || i || '0000', 'ip9', 'devX') ->> 'result',
  case when i <= 5 then 'inconnu' else 'limite' end,
  format('Essai de matricule n°%s depuis le même appareil', i))
from generate_series(1, 7) i;
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'qr', '20260002', 'ip9', 'devX') ->> 'result',
  'limite', 'Appareil bloqué : même un matricule valide est refusé');
reset role;
select ok((select count(*) >= 10 from public.checkin_attempts where session_id = 'a0000000-0000-4000-8000-0000000000d1'),
  'Toutes les tentatives sont journalisées');
select is((select count(*)::int from public.checkin_attempts where device_ref is not null and ip_hash like '%.%.%'), 0,
  'Aucune adresse IP en clair dans le journal des tentatives');

-- ===========================================================================
-- Fin du pointage, prolongation
-- ===========================================================================
update public.class_sessions set checkin_closes_at = now() - interval '1 second'
 where id = 'a0000000-0000-4000-8000-0000000000d1';
select tests.as_service();
select is(public.validate_scan('CODEPUBLIC01', (select v from tests.vars where k = 'token'), null, 'ip2', 'dev3') ->> 'result',
  'pointage_ferme', 'Après la fin du pointage : scan refusé');
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d1', 'qr', '20260002', 'ip2', 'dev3') ->> 'result',
  'pointage_ferme', 'Après la fin du pointage : enregistrement refusé');
reset role;

select tests.login_as('22222222-2222-4222-8222-222222222222');
select is(public.extend_checkin('a0000000-0000-4000-8000-0000000000d1', 5), now() + interval '5 minutes',
  'Prolongation d''un clic : +5 minutes à partir de maintenant');
reset role;
select tests.login_as('66666666-6666-4666-8666-666666666666');
select throws_ok($$ select public.extend_checkin('a0000000-0000-4000-8000-0000000000d1') $$, '42501', null,
  'Un collègue ne peut pas prolonger');
reset role;

-- ===========================================================================
-- Corrections manuelles et clôture
-- ===========================================================================
select tests.login_as('22222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ select public.set_attendance('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-000000000051', 'absent', '  ') $$,
  '22023', null, 'Correction sans justification : refusée');
select throws_ok(
  $$ select public.set_attendance('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-000000000053', 'present', 'Appel manuel') $$,
  'P0001', null, 'Impossible de marquer présent un étudiant d''un autre groupe');
select throws_ok(
  $$ select public.set_attendance('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-000000000051', 'retard', 'Arrivé en retard') $$,
  '22023', null, 'Statut « retard » non utilisé : refusé');

select is(public.close_session('a0000000-0000-4000-8000-0000000000d1'), '{"absents": 0, "presents": 2}'::jsonb,
  'Clôture : 2 présents, 0 absent');
select throws_ok($$ select * from public.rotate_session_token('a0000000-0000-4000-8000-0000000000d1') $$, 'P0001', null,
  'Plus de jeton QR après la clôture');
select lives_ok(
  $$ select public.set_attendance('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-000000000052', 'absent', 'Pointé depuis le téléphone d''un autre étudiant, absent en salle') $$,
  'Correction après clôture avec justification');
reset role;

select is((select status from public.attendance where student_id = 'a0000000-0000-4000-8000-000000000052'), 'absent',
  'La correction est appliquée');
select is((select reason from public.audit_log
           where table_name = 'attendance' and action = 'UPDATE' order by id desc limit 1),
  'Pointé depuis le téléphone d''un autre étudiant, absent en salle',
  'La justification est inscrite au journal d''audit');
select is((select actor_id from public.audit_log
           where table_name = 'attendance' and action = 'UPDATE' order by id desc limit 1),
  '22222222-2222-4222-8222-222222222222'::uuid, 'L''auteur de la correction est journalisé');
select is((select count(*)::int from public.session_tokens where session_id = 'a0000000-0000-4000-8000-0000000000d1'), 0,
  'Les jetons sont supprimés à la clôture');

-- Clôture avec absents : nouvelle séance, personne ne pointe.
insert into public.class_sessions (id, institution_id, assignment_id, scheduled_at) values
  ('a0000000-0000-4000-8000-0000000000d2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000c1', now());
select tests.login_as('22222222-2222-4222-8222-222222222222');
select lives_ok($$ select public.open_session('a0000000-0000-4000-8000-0000000000d2') $$, 'Ouverture de la 2e séance');
select is(public.close_session('a0000000-0000-4000-8000-0000000000d2'), '{"absents": 2, "presents": 0}'::jsonb,
  'Clôture sans pointage : les 2 étudiants du groupe sont absents');
select is((select count(*)::int from public.attendance where session_id = 'a0000000-0000-4000-8000-0000000000d2' and source = 'cloture'), 2,
  'Absences marquées avec la source « clôture »');
reset role;

select tests.login_as('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$ select public.set_attendance('a0000000-0000-4000-8000-0000000000d2', 'a0000000-0000-4000-8000-000000000051', 'present', 'Tentative croisée') $$,
  '42501', null, 'adminB ne peut pas modifier une présence de A');
select throws_ok($$ select public.close_session('a0000000-0000-4000-8000-0000000000d1') $$, '42501', null,
  'adminB ne peut pas clôturer une séance de A');
reset role;

select * from finish();
rollback;
