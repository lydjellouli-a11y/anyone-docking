# Présence QR

Plateforme de gestion de l'assiduité universitaire par QR code
(Next.js + TypeScript + Supabase). Conception : voir
[`docs/phase-1-architecture.md`](docs/phase-1-architecture.md).

## État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 1 | Architecture, schéma, rôles, risques | ✅ validée |
| 2 | Initialisation du projet + migrations SQL | ✅ testée localement |
| 3 | Authentification et isolation des données | ✅ testée sur Supabase local — [détails](docs/phase-3-authentification.md) |
| 4 | Import, groupes, séances | ✅ testée sur Supabase local — [détails](docs/phase-4-organisation-import-seances.md) |
| 5 | QR code et validation de présence | ✅ testée sur Supabase local — [détails](docs/phase-5-qr-pointage.md) |
| 6 | Exports et tableau de bord | ✅ testée sur Supabase local — [détails](docs/phase-6-historique-exports.md) |
| 7 | Tests, limites, déploiement | à faire |

**Mise en ligne (version d'essai)** : suivre [docs/mise-en-ligne.md](docs/mise-en-ligne.md).
Le développement et les tests se font avec Supabase en local (Docker).

## Organisation des fichiers

```
supabase/
  migrations/      Schéma SQL appliqué dans l'ordre (tables, RLS, fonctions)
  tests/           Tests SQL pgTAP (structure + isolation entre établissements)
  local-shim/      Imitation minimale de Supabase pour tester sans Docker
  templates/       Modèles d'e-mails (français)
  config.toml      Configuration Supabase locale
scripts/test-db.sh Applique les migrations sur une base neuve et lance les tests
src/app/           Pages Next.js
src/lib/           Clients Supabase, validation, dates (Africa/Algiers, JJ/MM/AAAA)
src/proxy.ts       Renouvellement de session, redirection vers /connexion
tests/api/         Tests par requêtes HTTP directes à l'API Supabase
tests/e2e/         Tests dans un vrai navigateur (Playwright)
docs/              Documents de conception
```

## Commandes

```bash
npm install          # installer les dépendances
npm run dev          # lancer le site en local (http://localhost:3000)
npm run lint         # vérifier le style du code
npm run typecheck    # vérifier les types TypeScript
npm test             # tests unitaires (Vitest)
npm run test:db      # migrations + tests SQL (PostgreSQL 15+ et pgTAP requis)
npx supabase start   # Supabase local (Docker requis)
npx supabase test db # tests SQL sur le vrai Postgres Supabase local
npm run test:api     # requêtes HTTP directes sur l'API (Supabase local)
npm run test:e2e     # parcours dans un vrai navigateur (Supabase local + .env.local)
npm run build && npm run check:secrets   # aucune clé secrète côté navigateur
npm run gen:types    # régénérer les types TypeScript depuis la base locale
```

Variables d'environnement : copier `.env.example` en `.env.local`.
La clé secrète Supabase ne doit **jamais** être préfixée par `NEXT_PUBLIC_`.

## Tests de la base : ce qu'ils prouvent, et ce qu'ils ne prouvent pas

`npm run test:db` exécute aujourd'hui 200 tests, dont :
- RLS activée sur toutes les tables, aucun droit pour les visiteurs anonymes ;
- contraintes (doublons de présence, matricule, clés étrangères composites
  empêchant de mélanger deux établissements) ;
- **accès croisé** : un admin de l'établissement B ne voit ni ne modifie rien
  de A ; un enseignant ne voit que ses groupes et séances ; un compte
  désactivé perd l'accès ; journal d'audit non modifiable.

Ces tests ont été vérifiés par « sabotage » : en introduisant volontairement
une faille (politique trop permissive, RLS désactivée, droit accordé à
`anon`), ils échouent bien.

Les mêmes tests passent sur PostgreSQL 16 avec une imitation de Supabase
(`supabase/local-shim`, sans Docker) **et** sur le vrai Postgres de Supabase
local (`npx supabase test db`). Depuis la phase 3, des tests par requêtes
HTTP directes sur l'API (`tests/api`) complètent ces tests SQL.

**Limite :** tout est testé sur Supabase **local**. Le projet Supabase en
ligne (phase 7) devra être reconfiguré à la main (confirmation des e-mails,
SMTP, modèles d'e-mails), puis revérifié.
