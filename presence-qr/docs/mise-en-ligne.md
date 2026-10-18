# Mise en ligne (version d'essai) — guide pas à pas

Ce guide est écrit pour une personne débutante. Durée : environ 30 à 45 minutes.
**Aucune clé ne doit être écrite dans une conversation, un e-mail ou un
fichier du dépôt.** Les clés se collent uniquement dans Supabase et dans Vercel.

Vous allez utiliser trois services gratuits :

| Service | Rôle |
|---|---|
| **GitHub** (déjà fait) | Stocke le code |
| **Supabase** | Base de données et comptes |
| **Vercel** | Héberge le site et lui donne une adresse `https://…vercel.app` |

---

## Étape 1 — Fusionner la Pull Request (GitHub)

1. Ouvrez https://github.com/lydjellouli-a11y/anyone-docking/pull/1
2. En bas de la page, cliquez sur **« Merge pull request »**, puis sur
   **« Confirm merge »**.

Cela ajoute le dossier `presence-qr/` à la branche principale (`main`).
Aucun fichier existant de votre dépôt n'est modifié.

## Étape 2 — Créer le projet Supabase

1. Allez sur https://supabase.com, puis **« Start your project »**.
   Inscrivez-vous **avec votre adresse e-mail habituelle** (important pour
   l'étape 6).
2. Cliquez sur **« New project »** et renseignez :
   - **Name** : `presence-qr` ;
   - **Database password** : cliquez sur « Generate a password », puis
     **notez-le en lieu sûr** (dans un gestionnaire de mots de passe, pas
     dans un e-mail) ;
   - **Region** : la région européenne la plus proche, par exemple
     **West EU (Paris)** ou **Central EU (Frankfurt)** ;
   - laissez les autres options par défaut.
3. Attendez environ 2 minutes que le projet soit prêt.

## Étape 3 — Installer la base de données (un seul copier-coller)

1. Ouvrez le fichier `presence-qr/supabase/deploy/schema-complet.sql` sur
   GitHub, puis cliquez sur l'icône **« Copy raw file »** (deux carrés
   superposés, en haut à droite du fichier).
2. Dans Supabase, menu de gauche : **SQL Editor**, puis **« New query »**.
3. Collez tout le contenu (Ctrl+V), puis cliquez sur **« Run »**.
4. Résultat attendu : **« Success. No rows returned »**.
   - Si un message demande de confirmer une opération « destructive »,
     acceptez : le script ne fait que créer des éléments sur un projet vide.
   - En cas d'erreur, ne relancez pas : copiez le message d'erreur et
     transmettez-le-moi (il ne contient aucune clé).

## Étape 4 — Mettre le site en ligne (Vercel)

1. Allez sur https://vercel.com, puis **« Sign Up »** → **« Continue with
   GitHub »** (plan gratuit **Hobby**).
2. Cliquez sur **« Add New… » → « Project »**, puis **« Import »** à côté de
   `anyone-docking`. Si le dépôt n'apparaît pas, autorisez Vercel à y
   accéder (lien « Adjust GitHub App Permissions »).
3. Vercel peut afficher la liste des applications du dépôt : sur la ligne
   **presence-qr (Next.js)**, cliquez sur **« Import single project »**.
   N'utilisez **pas** l'import « multi-service » (adresse contenant
   `framework=services`) : il provoque une erreur. Vérifiez ensuite que
   **Root Directory** = **`presence-qr`** et **Framework** = **Next.js**.
   Si le dossier n'apparaît pas, c'est que l'étape 1 (fusion) n'est pas
   faite ; une fois la fusion faite, rechargez la page.
4. Ouvrez **« Environment Variables »** et ajoutez ces **3 variables**. Les
   valeurs se trouvent dans Supabase : bouton **« Connect »** en haut de la
   page du projet, ou **Project Settings → API Keys** et **Data API**.

   | Nom (à recopier exactement) | Valeur à copier depuis Supabase |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`), **seulement l'adresse** |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (commence par `sb_publishable_`) |
   | `SUPABASE_SECRET_KEY` | Secret key (commence par `sb_secret_`, bouton « Reveal ») |

   ⚠ La **Secret key** ne doit être collée **que** dans Vercel.

5. Cliquez sur **« Deploy »** et attendez 2 à 3 minutes.
6. Notez l'adresse du site, par exemple `https://anyone-docking-xxxx.vercel.app`.
   Vous pouvez la renommer plus tard (Settings → Domains), par exemple en
   `presence-xxx.vercel.app`.

Astuce : la fenêtre « Connect » de Supabase affiche un bloc `.env.local` ;
ne suivez pas ses autres instructions (installation de paquets, fichiers),
déjà réalisées dans le code.

**Mises à jour ultérieures** : chaque fusion d'une Pull Request dans `main`
redéploie automatiquement le site (1 à 3 minutes).

## Étape 5 — Indiquer l'adresse du site à Supabase

Dans Supabase : **Authentication → URL Configuration** :
- **Site URL** : l'adresse Vercel, par exemple `https://anyone-docking-xxxx.vercel.app` ;
- **Redirect URLs** → « Add URL » : la même adresse suivie de `/**`, par
  exemple `https://anyone-docking-xxxx.vercel.app/**`.

Enregistrez (« Save »).

Vérifiez aussi **Authentication → Sign In / Providers → Email** :
**« Confirm email »** doit être **activé** (c'est le réglage par défaut).

## Étape 6 — Créer votre compte

1. Ouvrez l'adresse du site, puis **« Créer un compte »**.
2. Utilisez **la même adresse e-mail que votre compte Supabase**. Le service
   d'e-mails gratuit de Supabase n'envoie qu'aux membres du projet.
3. Ouvrez l'e-mail de confirmation et cliquez sur le lien **depuis le même
   navigateur** : vous arrivez sur « Mes espaces de travail ».
4. Créez votre espace de travail (par exemple le nom de votre université ou
   de votre département).

## Étape 7 — Fermer les inscriptions

Comme vous êtes seule à utiliser la plateforme pour l'instant, fermez les
inscriptions publiques : dans Supabase, **Authentication → Sign In /
Providers**, désactivez **« Allow new users to sign up »**, puis enregistrez.

## Étape 8 — Préparer le TD de demain (sur le site)

Dans votre espace :
1. **Semestres et modules** :
   - ajoutez le semestre (par exemple « 2026-2027 S1 », avec ses dates) ;
   - ajoutez le module (par exemple code `RATION`, intitulé « Ration
     alimentaire »).
2. **Sections et groupes** :
   - créez la section « M1 NDH » ;
   - créez les groupes G1 et G2 rattachés à cette section ;
   - pour chaque groupe, ouvrez-le et **importez la liste** (fichier Excel
     avec les colonnes Matricule, Nom, Prénom).
3. **Enseignements** : ajoutez « Ration alimentaire — TD — G1 », puis la même
   chose pour G2.
4. **Demain en salle** :
   - ouvrez l'enseignement, puis cliquez sur **« Démarrer une séance
     maintenant »** ;
   - cliquez sur **« Plein écran »** et projetez le QR code ;
   - au bout de 15 minutes, cliquez sur « Clôturer la séance ».

**Conseil pour le premier essai** : gardez aussi votre appel habituel (ou la
feuille d'émargement imprimable) en parallèle, puis comparez les deux.

---

## Limites de cette version d'essai (à connaître)

- **Sauvegardes** : le plan gratuit de Supabase n'offre pas de sauvegardes
  téléchargeables. Pendant l'essai, gardez une trace papier ou un export
  (l'export Excel arrive en phase 6).
- **Mise en pause** : un projet Supabase gratuit est mis en pause après une
  semaine **sans aucune activité**. Une utilisation hebdomadaire suffit à
  l'éviter. S'il est en pause, il se relance depuis le tableau de bord
  Supabase.
- **Données personnelles (loi 18-07)** : avant un usage généralisé, à valider
  avec votre établissement (hébergement en Europe, information des
  étudiants).
- **E-mails** : le service gratuit de Supabase est limité (quelques e-mails
  par heure, uniquement vers les membres du projet). Il faudra configurer un
  vrai service d'envoi avant d'ouvrir la plateforme à des collègues.
- La purge automatique des données temporaires (au-delà de 30 jours) sera
  programmée plus tard (phase 7).

---

## Mises à jour qui modifient la base de données

Certaines mises à jour demandent d'exécuter un petit script SQL dans Supabase.
**Toujours dans cet ordre** :
1. Supabase → **SQL Editor** → **New query** → coller le script indiqué →
   **Run** (résultat attendu : « Success »). Chaque script ne s'exécute
   **qu'une seule fois**.
2. Ensuite, fusionner la Pull Request sur GitHub.

| Date | Script (dans `presence-qr/supabase/deploy/`) | Ce qu'il ajoute |
|---|---|---|
| 18/10/2026 | `maj-2026-10-18-annulation-seance.sql` | Annuler une séance déjà ouverte ou clôturée (essai, erreur) |

Pour une **installation neuve**, `schema-complet.sql` contient déjà toutes
les mises à jour.

