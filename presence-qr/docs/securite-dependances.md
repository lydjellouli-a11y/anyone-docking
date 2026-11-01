# Sécurité des dépendances

Contrôle : `npm audit --omit=dev` (dépendances réellement mises en ligne).

## 01/11/2026

| Paquet | Gravité | Décision |
|---|---|---|
| `next` 16.4.0 | **Critique** (exécution de code à distance via l'optimisation d'images SVG et `use cache` ; déni de service via les Server Actions) | **Corrigé** : passage à `next` 16.4.3 (et `eslint-config-next` 16.4.3). L'application n'utilisait ni `next/image` ni `use cache`, mais elle utilise les Server Actions : mise à jour nécessaire. |
| `minimatch` < 11.0.1 (via `exceljs` → `archiver` → `readdir-glob` / `glob`) | Modérée (déni de service sur des motifs de recherche) | **Non exploitable ici** : ces motifs sont écrits dans la bibliothèque, jamais fournis par un utilisateur. Le correctif « forcé » proposé par npm installerait une ancienne version d'`exceljs` (changement cassant). À réévaluer à la prochaine version d'`exceljs`. |

Règle : relancer `npm audit --omit=dev` avant chaque mise en ligne ; toute
alerte **élevée ou critique** est corrigée avant la fusion.
