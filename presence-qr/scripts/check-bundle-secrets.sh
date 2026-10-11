#!/usr/bin/env bash
# Vérifie, APRÈS `npm run build`, qu'aucune clé secrète ne se trouve dans le
# code envoyé aux navigateurs (.next/static).
#   - recherche une clé secrète Supabase (« sb_secret_ » suivi de la clé ;
#     le préfixe seul apparaît légitimement dans la bibliothèque supabase-js) ;
#   - recherche les valeurs exactes de SUPABASE_SECRET_KEY et CHECKIN_SECRET
#     si elles sont définies, ainsi que leurs noms.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .next/static ]; then
  echo "Lancez d'abord : npm run build" >&2
  exit 2
fi

status=0
if grep -rlE "sb_secret_[A-Za-z0-9_-]{8,}" .next/static; then
  echo "ÉCHEC : une clé « sb_secret_ » apparaît dans le code navigateur." >&2
  status=1
fi
if [ -n "${SUPABASE_SECRET_KEY:-}" ] && grep -rlF "$SUPABASE_SECRET_KEY" .next/static; then
  echo "ÉCHEC : la valeur de SUPABASE_SECRET_KEY apparaît dans le code navigateur." >&2
  status=1
fi
if [ -n "${CHECKIN_SECRET:-}" ] && grep -rlF "$CHECKIN_SECRET" .next/static; then
  echo "ÉCHEC : la valeur de CHECKIN_SECRET apparaît dans le code navigateur." >&2
  status=1
fi
if grep -rlE "SUPABASE_SECRET_KEY|CHECKIN_SECRET" .next/static; then
  echo "ÉCHEC : un nom de variable secrète est référencé dans le code navigateur." >&2
  status=1
fi

[ $status -eq 0 ] && echo "OK : aucune clé secrète trouvée dans .next/static"
exit $status
