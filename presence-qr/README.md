# Présence QR

Plateforme de gestion de l'assiduité universitaire par QR code
(Next.js + TypeScript + Supabase). Conception : voir
[`docs/phase-1-architecture.md`](docs/phase-1-architecture.md).

## État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 1 | Architecture, schéma, rôles, risques | ✅ validée |
| 2 | Initialisation du projet + migrations SQL | ✅ testée localement (voir ci-dessous) |
| 3 | Authentification et isolation des données | à faire |
| 4 | Import, groupes, séances | à faire |
| 5 | QR code et validation de présence | à faire |
| 6 | Exports et tableau de bord | à faire |
| 7 | Tests, limites, déploiement | à faire |

Rien n'est déployé. Aucun compte Supabase ou Vercel n'est encore nécessaire.

## Organisation des fichiers

```
supabase/
  migrations/      Schéma SQL appliqué dans l'ordre (tables, RLS, fonctions)
  tests/           Tests SQL pgTAP (structure + isolation entre établissements)
  local-shim/      Imitation minimale de Supabase pour tester sans Docker
  config.toml      Configuration Supabase locale
scripts/test-db.sh Applique les migrations sur une base neuve et lance les tests
src/app/           Pages Next.js
src/lib/           Clients Supabase, dates (Africa/Algiers, JJ/MM/AAAA)
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
```

Variables d'environnement : copier `.env.example` en `.env.local`.
La clé secrète Supabase ne doit **jamais** être préfixée par `NEXT_PUBLIC_`.

## Tests de la base : ce qu'ils prouvent, et ce qu'ils ne prouvent pas

`npm run test:db` exécute aujourd'hui 112 tests, dont :
- RLS activée sur toutes les tables, aucun droit pour les visiteurs anonymes ;
- contraintes (doublons de présence, matricule, clés étrangères composites
  empêchant de mélanger deux établissements) ;
- **accès croisé** : un admin de l'établissement B ne voit ni ne modifie rien
  de A ; un enseignant ne voit que ses groupes et séances ; un compte
  désactivé perd l'accès ; journal d'audit non modifiable.

Ces tests ont été vérifiés par « sabotage » : en introduisant volontairement
une faille (politique trop permissive, RLS désactivée, droit accordé à
`anon`), ils échouent bien.

**Limite :** ils tournent sur PostgreSQL 16 avec une imitation de Supabase
(`supabase/local-shim`), en simulant le jeton de connexion. Les tests par
requêtes HTTP directes sur la vraie API Supabase sont prévus en phase 3.
