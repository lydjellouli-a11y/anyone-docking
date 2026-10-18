# Phase 4 — Organisation pédagogique, import des listes, séances

> Statut : **implémentée et testée sur Supabase local**. Rien n'est déployé.

## 1. Modèle retenu (d'après votre organisation réelle)

- **Section** : regroupe des groupes de TD. Un **cours magistral** est
  affecté à la section entière.
- **Groupe** : G1, G2, G3… rattaché (ou non) à une section. Un **TD/TP** est
  affecté à un groupe.
- **La liste d'une section** = les étudiants de tous ses groupes (plus ceux
  inscrits directement dans la section). On importe donc la liste de
  **chaque groupe**.
- Le même nom « G1 » peut exister dans deux sections différentes.

Exemple (fictif) correspondant à votre cas :

| Semestre | Section / groupe | Enseignement | Jour |
|---|---|---|---|
| 2026-2027 S1 | Section M1 NDH → G1, G2 | Ration alimentaire — TD (G1 et G2) | lundi |
| 2026-2027 S1 | Section L1 → G1, G2, G3… | Cytologie — Cours (section) | mercredi |
| | | Cytologie — TD G1 et TD G3 | mercredi |

## 2. Écrans

| Écran | Qui | Contenu |
|---|---|---|
| Tableau de bord | tous | Mes enseignements et la prochaine séance de chacun |
| Semestres et modules | admin | Création / suppression |
| Sections et groupes | admin (création), enseignant (lecture de ses groupes) | Arborescence et effectifs |
| Page d'un groupe | admin, enseignant du groupe | Liste des étudiants, **importation** |
| Enseignements | admin (création), enseignant (les siens) | Module + section/groupe + type + enseignant |
| Page d'un enseignement | enseignant | Séances : **planification hebdomadaire**, ponctuelle, annulation |

## 3. Importation des listes

1. Choisir un fichier **.xlsx** ou **.csv** (2 Mo et 2000 étudiants maximum).
2. **Vérifier** : le fichier est lu sur le serveur, rien n'est encore enregistré.
   - en-tête reconnu même s'il y a des lignes de titre au-dessus, avec des
     variantes : « N° Matricule », « Nom », « Prénom » ; les autres colonnes
     sont ignorées ;
   - CSV avec « ; » (Excel en français) ou « , », encodage UTF-8 ou Windows ;
   - matricule nettoyé (espaces retirés, majuscules) ;
   - erreurs listées **avec le numéro de ligne Excel** (matricule invalide,
     nom manquant, doublon dans le fichier).
3. **Importer** (seulement s'il n'y a aucune erreur) : **tout ou rien**, via la
   fonction SQL `import_students`.
   - un matricule déjà connu n'est pas recréé, et son nom **n'est pas écrasé**
     automatiquement : la différence est signalée. L'admin peut alors cliquer
     sur **« Remplacer par les noms du fichier »** pour appliquer les noms du
     fichier ;
   - réimporter le même fichier ne crée aucun doublon.

## 4. Sécurité ajoutée

- `import_students` : réservée à l'admin ou à un enseignant du groupe (ou de
  sa section). Un groupe inexistant et un groupe interdit donnent **le même
  message**, pour ne rien révéler.
- Un enseignant de **cours de section** voit les groupes et étudiants de sa
  section ; un enseignant de **TD** ne voit que son groupe.
- Une séance ne change d'état que par fonction (`cancel_session`), et
  seulement pour son enseignant.
- Inscriptions/désinscriptions des groupes **journalisées** (audit).
- Une faille mineure a été corrigée pendant les tests : le contrôle « section
  du même semestre » pouvait révéler l'existence d'une section d'un autre
  établissement. Il est maintenant limité au même établissement.

## 5. Tests (preuves)

| Commande | Résultat |
|---|---|
| `npm test` (unitaires : lecture CSV/XLSX, dates, planification) | 43/43 ✅ |
| `npm run test:db` et `npx supabase test db` (SQL) | 143/143 ✅ (chacun) |
| `npm run test:api` (requêtes HTTP directes) | 38/38 ✅ |
| `npm run test:e2e` (navigateur) | 11/11 ✅ |
| `npm run check:secrets`, `npm audit --omit=dev` | OK, 0 vulnérabilité |

Le test navigateur de la phase 4 reproduit votre cas avec des données
fictives : section L1, groupes G1 et G3, import CSV et XLSX, cours de
section, 3 séances le mercredi (14/10, 21/10, 28/10/2026 à 10:00), annulation
d'une séance, puis tentative d'accès par un autre compte (refusée).

Un défaut d'interface a été trouvé et corrigé : après un ajout, le bloc de
formulaire se refermait et cachait le message de confirmation. Le test
vérifie maintenant que le message est **visible**.

## 6. Limites connues

- **Format des champs de date** : les sélecteurs de date sont ceux du
  téléphone ou du navigateur. Ils s'affichent dans le format de la langue de
  l'appareil (JJ/MM/AAAA sur un appareil en français, MM/JJ/AAAA en anglais).
  Toutes les dates **affichées** par l'application sont en JJ/MM/AAAA.
- Correction du nom d'un étudiant : bouton **« Modifier »** dans la liste du
  groupe (admin). La correction est journalisée (ancien et nouveau nom).
- Pas encore de renommage de groupe ni de déplacement d'un étudiant d'un
  groupe à un autre : il faut retirer, puis réimporter.
- Les jours fériés et vacances ne sont pas exclus automatiquement de la
  planification hebdomadaire : annulez les séances concernées.
- Un étudiant peut être inscrit dans deux groupes d'une même section (pas de
  contrôle d'unicité) : à surveiller lors des imports.
- Le format .xls (ancien Excel) n'est pas lu : l'enregistrer en .xlsx ou .csv.
