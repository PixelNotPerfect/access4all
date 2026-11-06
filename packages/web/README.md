# @access4all/web

App web statique, sans serveur : les données restent dans le navigateur (enregistrement automatique, export et import JSON).

| Écran | Pour qui | Ce qu'il fait |
|---|---|---|
| Revue de maquettes | Designers | Checklist des critères qui se décident à la conception (RGAA + WCAG 2.2), vérificateur de contraste, export Markdown des points à corriger |
| Grille de recette et d'audit | BA, auditeurs | Échantillon de pages, statut C / NC / NA par critère et par page, tests et méthode officiels, import du rapport JSON de `access4all check` |
| Rapport et calendrier | Tout métier | Taux de conformité global et moyen, mention légale, résultats par thématique et par page, calendrier d'actions par lots, export .ics, CSV et impression PDF |

## Développement

```bash
npm run dev -w @access4all/web      # http://localhost:5173
npm run build                        # construit core, cli puis l'app dans packages/web/dist
npm test -w @access4all/web          # tests unitaires + tests de bout en bout (Chromium)
```

Les tests de bout en bout vérifient que l'app est elle-même accessible : aucune erreur axe-core sur les quatre écrans, pas de défilement horizontal à 320 px, focus déplacé sur le titre à chaque changement d'écran.

## Publication

Le workflow `.github/workflows/pages.yml` publie l'app sur GitHub Pages à chaque fusion dans `main`. À activer une fois dans *Settings › Pages › Source : GitHub Actions*.
