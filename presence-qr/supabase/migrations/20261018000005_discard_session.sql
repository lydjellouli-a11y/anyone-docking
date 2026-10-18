-- =============================================================================
-- Migration 5 : annuler une séance déjà ouverte ou clôturée (essai, erreur).
--
-- La séance passe à l'état « annulée » : elle n'est plus comptée dans
-- l'historique, les absences ni les exports (qui ne retiennent que les séances
-- clôturées). Les présences enregistrées ne sont PAS supprimées : elles restent
-- en base et au journal d'audit, avec la justification donnée.
-- =============================================================================

create function public.discard_session(p_session_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not private.owns_session(p_session_id) then
    raise exception 'Séance introuvable ou accès refusé' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'Une justification (3 à 500 caractères) est obligatoire' using errcode = '22023';
  end if;

  -- Lue par le trigger d'audit (valable pour cette transaction seulement).
  perform set_config('app.audit_reason', v_reason, true);

  update public.class_sessions
     set status = 'cancelled', fallback_code = null
   where id = p_session_id and status in ('planned', 'open', 'closed');
  if not found then
    raise exception 'Cette séance est déjà annulée' using errcode = 'P0001';
  end if;

  delete from public.session_tokens where session_id = p_session_id;
end;
$$;

revoke execute on function public.discard_session(uuid, text) from public, anon;
grant execute on function public.discard_session(uuid, text) to authenticated;
