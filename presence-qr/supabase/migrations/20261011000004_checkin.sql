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
