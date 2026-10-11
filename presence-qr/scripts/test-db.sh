#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Teste les migrations SQL sur un PostgreSQL local (sans Docker) :
#   1. crée une base neuve « presence_qr_test » ;
#   2. charge l'imitation Supabase (supabase/local-shim) ;
#   3. applique les migrations dans l'ordre ;
#   4. exécute les tests pgTAP de supabase/tests avec pg_prove.
#
# Prérequis : PostgreSQL 15+ et l'extension pgTAP (paquet postgresql-XX-pgtap).
# Variables utiles : PGHOST, PGPORT, PGUSER (superutilisateur), PGPASSWORD.
# Les mêmes tests pourront être lancés sur Supabase local avec `supabase test db`.
# -----------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."
DB="${TEST_DB_NAME:-presence_qr_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

echo "→ Base de test : $DB"
"${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force);"
"${PSQL[@]}" -d postgres -c "create database $DB;"

"${PSQL[@]}" -d "$DB" -f supabase/local-shim/supabase_shim.sql

for f in supabase/migrations/*.sql; do
  echo "→ Migration $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

"${PSQL[@]}" -d "$DB" -c "create extension if not exists pgtap with schema extensions;"

echo "→ Tests"
pg_prove -d "$DB" --ext .sql supabase/tests/
