# Phase 6 — Historique cumulé, seuil d'absences, exports

> Statut : **implémentée et testée sur Supabase local**. **Aucune
> modification de la base** : pour la version en ligne, il suffit de
> déployer le nouveau code (fusion de la Pull Request) ; rien à coller dans
> Supabase.

## 1. Ce qui est ajouté

- **Page « Historique cumulé »** par enseignement (lien depuis la page de
  l'enseignement et depuis le tableau de bord) :
  - une ligne par étudiant et une colonne par **séance clôturée** (date
    JJ/MM) ;
  - **P** (présent), **A** (absent non justifié), **E** (excusé), case vide
    (pas encore inscrit à cette date) ;
  - totaux P / A / E et **taux d'absence** ;
  - **seuil : 3 absences non justifiées**. Les lignes concernées sont en
    rouge avec ⚠, et un message indique le nombre d'étudiants concernés. Les
    absences justifiées (E) **ne comptent pas** dans le seuil.
- **Tableau de bord** : pour chaque enseignement, le nombre de séances
  clôturées, le taux de présence global et l'alerte « ⚠ n étudiant(s) à 3
  absences ou plus ».
- **Export Excel (.xlsx)** :
  - feuille « Assiduité » : en-tête (établissement, module, groupe,
    semestre, date d'export à l'heure d'Alger, légende), le tableau cumulé et
    les lignes au seuil surlignées en rouge ; les volets sont figés sur les
    noms ;
  - feuille « Séances » : date, heure, salle, présents / absents / excusés.
- **Export CSV** : format « Excel français » (séparateur `;`, UTF-8 avec BOM
  pour les accents, dates JJ/MM/AAAA).

## 2. Règles de calcul

- Seules les séances **clôturées** comptent. Les séances planifiées,
  ouvertes ou annulées sont ignorées.
- Un étudiant ajouté au groupe en cours de semestre n'est pas compté absent
  pour les séances antérieures (case vide).
- Taux d'absence = (A + E) / nombre de séances où l'étudiant avait un statut.

## 3. Sécurité

- Les exports sont générés **sur le serveur, avec les droits de
  l'utilisatrice** (RLS) : un autre compte reçoit une erreur 404, et une
  personne non connectée est redirigée vers la connexion. Aucune donnée
  n'est renvoyée dans ces deux cas (testé).
- **Protection contre l'« injection de formule »** : une cellule qui
  commence par `=`, `+`, `-` ou `@` (par exemple un nom piégé dans une liste
  importée) est préfixée d'une apostrophe, pour qu'Excel ne l'exécute jamais
  comme une formule.
- Les fichiers ne sont pas mis en cache (`Cache-Control: no-store`).

## 4. Tests (preuves)

| Commande | Résultat |
|---|---|
| `npm test` (dont 16 nouveaux : calcul, seuil, CSV, Excel relu, injection de formule) | 71/71 ✅ |
| `npm run test:db` et `npx supabase test db` | 200/200 ✅ (chacun) |
| `npm run test:api` | 42/42 ✅ |
| `npm run test:e2e` (dont le parcours historique + téléchargements relus) | 14/14 ✅ |
| `npm run check:secrets`, `npm audit --omit=dev` | OK, 0 vulnérabilité |

## 5. Limites

- Le seuil (3) est fixé pour tout l'établissement. Il n'est pas encore
  réglable depuis l'interface.
- Pas encore d'export regroupant **tous** les enseignements dans un seul
  fichier : il y a un fichier par enseignement.
