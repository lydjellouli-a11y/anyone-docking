# Phase 5 — QR code et validation de présence

> Statut : **implémentée et testée sur Supabase local**. Rien n'est déployé.
> Réglages retenus : **15 minutes** de pointage, **prolongation de 5 minutes
> d'un clic**, **pas de statut « retard »**.

## 1. Déroulement d'une séance

1. **Ouvrir** une séance planifiée, ou bien « Démarrer une séance
   maintenant ». La fin du pointage est alors fixée à +15 min (heure du
   serveur), et un **code de secours à 6 chiffres** est généré.
2. **L'écran projeté** affiche :
   - un **QR code qui change toutes les 20 secondes** (chaque jeton reste
     valable 45 s) ;
   - le compte à rebours, le code de secours et l'adresse courte `/code` ;
   - un bouton « Plein écran ».
3. **L'étudiant scanne** le QR code avec son téléphone, sans compte :
   - le jeton est vérifié **au moment du scan** ;
   - le serveur délivre alors un **passage signé de 3 minutes** pour taper le
     matricule ;
   - la confirmation affiche l'heure du **serveur** et un nom partiel
     (« A. F*** »).
4. **Le tableau en direct** se met à jour toutes les 4 secondes : présents /
   attendus, heure et source (QR, code, manuel), avertissement ⚠ « même
   téléphone ».
5. **« Prolonger de 5 minutes »** : un clic.
6. **« Clôturer la séance »** : tous les étudiants attendus qui n'ont pas
   pointé sont marqués **absents**, et les jetons sont supprimés.
7. **Corrections** (pendant ou après la séance) : présent, absent ou excusé,
   avec une **justification obligatoire** inscrite au journal d'audit, avec
   son auteur.

## 2. Procédures de secours

| Situation | Solution |
|---|---|
| Le QR ne se scanne pas | L'étudiant va sur `…/code` et saisit le code à 6 chiffres + son matricule |
| Le réseau de l'enseignante coupe | Un bandeau « Connexion perdue » s'affiche ; les étudiants qui ont du réseau continuent avec le code de secours |
| Aucun réseau | **Feuille d'émargement imprimable** (à imprimer à l'avance), puis ressaisie avec la justification « Feuille papier » |
| Réseau de l'étudiant coupé à l'envoi | Message clair : « votre présence n'est **pas** enregistrée, réessayez » |

## 3. Sécurité : ce qui est garanti et ce qui ne l'est pas

**Garanti par la base, et testé :**
- Le pointage n'est **appelable que par le serveur** (fonctions
  `validate_scan` et `record_checkin`, réservées à la clé secrète). Avec la
  clé publique, l'appel est refusé, y compris pour l'enseignante connectée.
- Jeton inventé ou expiré, séance non ouverte, pointage terminé, étudiant
  d'un autre groupe : tous refusés.
- **Doublon impossible** : contrainte d'unicité en base, même avec deux envois
  simultanés.
- Seul le **hash** des jetons QR est stocké.
- **Limitation des abus** :
  - un appareil est bloqué après **5 matricules refusés** sur une séance ;
  - les seuils par adresse IP sont larges (60 échecs ou 1500 tentatives en
    10 minutes), car toute une salle peut partager la même adresse (Wi-Fi,
    opérateur mobile).
- Les adresses IP et les appareils ne sont **jamais stockés en clair**
  (empreinte HMAC avec un secret serveur).
- Ouvrir, prolonger, obtenir un QR, clôturer, corriger : réservé à
  l'enseignant de la séance. Un autre établissement est refusé.

**Ce que le système ne peut PAS garantir** (limites assumées) :
- **Le matricule n'est pas une preuve d'identité** : un étudiant présent peut
  saisir le matricule d'un absent. C'est **signalé** s'il utilise le même
  téléphone, mais pas s'il en utilise un autre.
- **Le QR ne prouve pas la présence physique** : une photo du QR envoyée
  immédiatement (par WhatsApp, par exemple) reste utilisable environ 45
  secondes, puis 3 minutes pour la saisie. Le code de secours est valable
  pendant toute la durée du pointage.
- **Contrôle conseillé** : comparer en fin de pointage le nombre de
  « Présents » au nombre de personnes réellement dans la salle, et corriger
  avec justification.

## 4. Tests (preuves)

| Commande | Résultat |
|---|---|
| `npm run test:db` et `npx supabase test db` (SQL, dont 56 nouveaux tests de pointage) | 200/200 ✅ (chacun) |
| `npm run test:api` (requêtes HTTP directes) | 42/42 ✅ |
| `npm test` (unitaires : passage signé, pseudonymisation…) | 55/55 ✅ |
| `npm run test:e2e` (navigateurs) | 13/13 ✅ |
| `npm run check:secrets` (y compris `CHECKIN_SECRET`), `npm audit --omit=dev` | OK, 0 vulnérabilité |

Le test navigateur du pointage simule une enseignante et **trois téléphones
d'étudiants**. Il vérifie notamment :
- un scan valide ;
- un doublon ;
- un étudiant d'un autre groupe ;
- un QR falsifié ;
- le code de secours ;
- le tableau en direct ;
- **la rotation du QR** ;
- la prolongation ;
- une correction justifiée ;
- la clôture ;
- l'ancien QR refusé après la clôture ;
- la feuille d'émargement ;
- l'absence d'erreurs dans la console ;
- l'accès refusé à un autre compte.

**Vérification par sabotage** : en autorisant volontairement `record_checkin`
avec la clé publique, 2 tests d'API échouent.

## 5. Limites et suites

- Le tableau en direct relit les données toutes les 4 secondes (pas de
  « temps réel » Supabase) : c'est plus simple et plus robuste sur un réseau
  faible.
- Les corrections faites **sans réseau** ne sont pas mises en file
  d'attente (contrairement à ce qu'envisageait la phase 1). La procédure
  prévue est la feuille papier, puis la ressaisie.
- La purge automatique (tentatives au-delà de 30 jours, jetons) sera
  programmée en phase 7.
- Nouvelles variables d'environnement serveur : `CHECKIN_SECRET` (au moins
  32 caractères) et `SITE_URL` (adresse publique pour le QR en production).
