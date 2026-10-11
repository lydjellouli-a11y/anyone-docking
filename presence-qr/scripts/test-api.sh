#!/usr/bin/env bash
# Lance les tests d'API (requêtes HTTP directes) contre Supabase LOCAL.
# Prérequis : Docker et `npx supabase start`. N'utilise QUE la clé publique.
set -euo pipefail
cd "$(dirname "$0")/.."

eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
export SUPABASE_TEST_URL="$API_URL"
export SUPABASE_TEST_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"

npx vitest run --config vitest.api.config.mts
