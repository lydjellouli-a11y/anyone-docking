#!/usr/bin/env bash
# Réunit toutes les migrations en UN seul fichier SQL, à coller dans
# l'éditeur SQL de Supabase lors de la première mise en ligne
# (supabase/deploy/schema-complet.sql). À relancer après toute nouvelle migration.
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/deploy/schema-complet.sql
{
  echo "-- ============================================================================="
  echo "-- Présence QR — schéma complet (généré par scripts/build-deploy-sql.sh)"
  echo "-- NE PAS MODIFIER À LA MAIN. À exécuter UNE SEULE FOIS sur un projet Supabase"
  echo "-- neuf : Supabase → SQL Editor → coller tout le fichier → Run."
  echo "-- ============================================================================="
  echo "begin;"
  for f in supabase/migrations/*.sql; do
    echo
    echo "-- >>> $(basename "$f")"
    cat "$f"
  done
  echo
  echo "commit;"
} > "$out"
echo "Écrit : $out"
