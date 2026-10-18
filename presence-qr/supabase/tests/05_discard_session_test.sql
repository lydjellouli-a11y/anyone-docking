-- Tests : annulation d'une séance clôturée (essai). Données 100 % fictives.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'admin');
insert into public.semesters (id, institution_id, label, start_date, end_date) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'S1', '2026-09-01', '2027-01-31');
insert into public.modules (id, institution_id, code, name) values
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'RATION', 'Ration fictive');
insert into public.groups (id, institution_id, semester_id, name) values
  ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'G1');
insert into public.students (id, institution_id, matricule, last_name, first_name) values
  ('a0000000-0000-4000-8000-000000000051', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20260001', 'Fictif', 'Amina');
insert into public.group_students (institution_id, group_id, student_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000051');
insert into public.teaching_assignments (id, institution_id, teacher_id, module_id, group_id, session_type) values
  ('a0000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', 'td');
insert into public.class_sessions (id, institution_id, assignment_id, scheduled_at) values
  ('a0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000c1', now());

-- Séance d'essai : ouverte puis clôturée → l'étudiante est absente.
select tests.login_as('22222222-2222-4222-8222-222222222222');
select public.open_session('a0000000-0000-4000-8000-0000000000d1');
select public.close_session('a0000000-0000-4000-8000-0000000000d1');
reset role;
select is((select status from public.attendance where session_id = 'a0000000-0000-4000-8000-0000000000d1'), 'absent',
  'Séance d''essai clôturée : absence enregistrée');

select ok(not has_function_privilege('anon', 'public.discard_session(uuid, text)', 'execute'), 'anon ne peut pas annuler de séance');

-- Accès croisé et collègue
select tests.login_as('33333333-3333-4333-8333-333333333333');
select throws_ok($$ select public.discard_session('a0000000-0000-4000-8000-0000000000d1', 'Tentative croisée') $$,
  '42501', null, 'adminB ne peut pas annuler une séance de A');
reset role;
select tests.login_as('66666666-6666-4666-8666-666666666666');
select throws_ok($$ select public.discard_session('a0000000-0000-4000-8000-0000000000d1', 'Pas ma séance') $$,
  '42501', null, 'Un collègue ne peut pas annuler la séance d''un autre');
reset role;

-- L'enseignante annule sa séance d'essai
select tests.login_as('22222222-2222-4222-8222-222222222222');
select throws_ok($$ select public.discard_session('a0000000-0000-4000-8000-0000000000d1', ' ') $$,
  '22023', null, 'Justification obligatoire');
select lives_ok($$ select public.discard_session('a0000000-0000-4000-8000-0000000000d1', 'Séance d''essai') $$,
  'L''enseignante annule sa séance clôturée');
select is((select status from public.class_sessions where id = 'a0000000-0000-4000-8000-0000000000d1'), 'cancelled',
  'La séance est annulée');
select throws_ok($$ select public.discard_session('a0000000-0000-4000-8000-0000000000d1', 'Encore') $$,
  'P0001', null, 'Une séance déjà annulée ne peut pas l''être à nouveau');
reset role;

select is((select count(*)::int from public.attendance where session_id = 'a0000000-0000-4000-8000-0000000000d1'), 1,
  'Les présences ne sont pas supprimées (traçabilité)');
select is((select reason from public.audit_log where table_name = 'class_sessions' and action = 'UPDATE' order by id desc limit 1),
  'Séance d''essai', 'L''annulation et sa justification sont journalisées');

-- Une séance ouverte annulée n'accepte plus de pointage
insert into public.class_sessions (id, institution_id, assignment_id, scheduled_at, public_code) values
  ('a0000000-0000-4000-8000-0000000000d2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-0000000000c1', now(), 'CODEPUBLIC02');
select tests.login_as('22222222-2222-4222-8222-222222222222');
select public.open_session('a0000000-0000-4000-8000-0000000000d2');
select public.discard_session('a0000000-0000-4000-8000-0000000000d2', 'Ouverte par erreur');
reset role;
set local role service_role;
select is(public.record_checkin('a0000000-0000-4000-8000-0000000000d2', 'qr', '20260001', 'ip', 'dev') ->> 'result',
  'pointage_ferme', 'Séance annulée : plus aucun pointage accepté');
reset role;

select * from finish();
rollback;
