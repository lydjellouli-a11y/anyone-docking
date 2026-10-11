# Phase 3 — Authentification et isolation des données

> Statut : **implémentée et testée sur Supabase local** (Docker). Rien n'est
> déployé.

## 1. Ce qui fonctionne

| Page | Rôle |
|---|---|
| `/inscription` | Création d'un compte enseignant (nom, e-mail, mot de passe) |
| `/connexion` | Connexion par e-mail et mot de passe |
| `/mot-de-passe-oublie` | Envoi d'un lien de réinitialisation par e-mail |
| `/auth/confirm` | Arrivée des liens reçus par e-mail (confirmation, réinitialisation) |
| `/compte/nouveau-mot-de-passe` | Choix d'un nouveau mot de passe |
| `/espace` | Liste des espaces de travail ; création du premier espace |
| `/espace/[id]` | Page d'un établissement (contenu en phase 4) |

### Comment la sécurité est assurée (trois niveaux)

1. **Proxy** (`src/proxy.ts`) : renouvelle la session à chaque requête et
   renvoie vers `/connexion` si l'on ouvre `/espace` sans être connecté.
   C'est un confort, **pas** la protection principale.
2. **Chaque page** appelle `requireUser()`, qui vérifie la session auprès du
   serveur d'authentification Supabase (un cookie falsifié ne suffit pas).
3. **La base de données (RLS)** ne renvoie que les lignes autorisées. Une
   page qui demande l'établissement d'un autre reçoit « rien » → page 404,
   sans même révéler que cet établissement existe.

### Choix faits

- **Connexion depuis le navigateur** (et non depuis le serveur Next.js) :
  Supabase voit l'adresse IP réelle de chaque enseignant, et ses limites
  anti-abus (nombre de tentatives de connexion) s'appliquent par personne.
  Si la connexion passait par le serveur, toutes les tentatives sembleraient
  venir de la même adresse.
- **Messages d'erreur neutres** : « E-mail ou mot de passe incorrect », et
  « si un compte existe, un e-mail a été envoyé ». Ces messages ne révèlent pas
  quels e-mails sont inscrits.
- **Liens par e-mail en `token_hash`** (`supabase/templates/`) : ils
  fonctionnent même si l'e-mail est ouvert sur un autre appareil (par
  exemple, la demande est faite sur l'ordinateur et le lien est ouvert sur le
  téléphone). Un lien ne sert qu'une fois. La redirection après le lien
  n'accepte que des chemins internes au site (`safeNextPath`).
- **Mot de passe** : 10 caractères minimum, avec minuscule, majuscule et
  chiffre (vérifié dans le formulaire **et** par Supabase).
- **En-têtes de sécurité** : interdiction d'afficher le site dans une iframe,
  `nosniff`, politique de référent, permissions (caméra, micro, position)
  désactivées.

## 2. Tests exécutés (preuves)

| Commande | Ce qui est testé | Résultat |
|---|---|---|
| `npm test` | Dates, validation des formulaires, redirections sûres | 20/20 ✅ |
| `npm run test:db` | Structure et isolation SQL (PostgreSQL 16 + imitation) | 112/112 ✅ |
| `npx supabase test db` | Les **mêmes** 112 tests, sur le **vrai** Postgres Supabase | 112/112 ✅ |
| `npm run test:api` | Requêtes HTTP directes (REST, GraphQL, RPC) avec la clé publique | 35/35 ✅ |
| `npm run test:e2e` | Parcours complet dans un vrai navigateur (Chromium) | 10/10 ✅ |
| `npm run check:secrets` | Aucune clé secrète dans le code envoyé au navigateur | OK ✅ |

Les tests d'API couvrent notamment :
- un visiteur anonyme qui tente de lire ou d'écrire des données ;
- l'admin d'un établissement B qui tente de lire, modifier ou supprimer les
  données de A, ou de se déclarer admin de A ;
- l'accès par l'API **GraphQL** (une autre porte d'entrée de Supabase) ;
- l'appel des fonctions internes et du schéma `private` (refusés) ;
- un **jeton de connexion falsifié** (rejeté, erreur 401) ;
- un enseignant ajouté par l'admin, qui ne voit pas les étudiants en dehors de
  ses groupes et ne peut pas se nommer admin.

**Vérification par sabotage** : en ouvrant volontairement la lecture des
étudiants à tous, 3 tests d'API échouent. Après restauration, ils repassent.

## 3. Comment lancer les tests (pour mémoire)

```bash
npx supabase start                 # démarre Supabase local (Docker requis)
npm run test:api                   # tests d'API
cp .env.example .env.local         # puis renseigner les clés locales
                                   # (affichées par `npx supabase status`)
npm run test:e2e                   # tests navigateur
```

## 4. Limites et points à traiter avant un usage réel

| Point | État | À faire au déploiement (phase 7) |
|---|---|---|
| Confirmation de l'e-mail à l'inscription | **Désactivée en local** (pour les tests) | **L'activer** dans Supabase (Authentication → Providers → Email) |
| Envoi des e-mails | Local : interceptés par Mailpit | Configurer un vrai serveur SMTP. Celui de Supabase est très limité. |
| Modèles d'e-mails en français | Fichiers dans `supabase/templates/` | Les recopier dans le tableau de bord Supabase |
| Inscription ouverte à tous | Toute personne peut créer un compte et **son propre** espace (3 au maximum). Elle ne voit aucune donnée d'autrui. | Décider s'il faut fermer les inscriptions publiques |
| Mots de passe déjà divulgués | Non vérifié | Activer « Leaked password protection » (plan payant Supabase) |
| Ajout de collègues | Possible en base (par l'admin), **pas encore d'écran** | Invitations prévues après la V1 |
| Double authentification (2FA) | Non | Possible plus tard (Supabase MFA) |
