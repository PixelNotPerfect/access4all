# access4all

Boîte à outils d'accessibilité numérique fondée sur le **RGAA 4.1.2**, complété par les **WCAG 2.2**, et sur l'outil [acces-cible](https://github.com/betagouv/acces-cible) de beta.gouv.fr.

Elle s'adresse à quatre profils :

| Profil | Besoin | Outil |
|---|---|---|
| Développeur | Savoir pas à pas quoi corriger dans son code avant la recette | [`access4all check`](packages/cli) |
| Designer | Repérer ce qui n'est pas accessible dans ses maquettes avant de les livrer | [App web › Revue de maquettes](packages/web) (vérificateur de contraste inclus) ou `access4all checklist --role design` |
| BA / recette | Dérouler une recette accessibilité guidée | [App web › Grille de recette](packages/web) ou `access4all checklist --role ba` |
| Tout métier | Auditer un site, obtenir un rapport et un calendrier d'actions | [App web › Rapport et calendrier](packages/web), alimenté par le scan de la CLI |

## Paquets

- [`@access4all/core`](packages/core) : le socle commun. Référentiel RGAA 4.1.2 + compléments WCAG 2.2, conseils par métier, correspondance axe-core, calcul du taux de conformité et calendrier d'actions (export .ics et CSV).
- [`@access4all/web`](packages/web) : l'app web statique (revue de maquettes, grille de recette et d'audit, rapport, calendrier .ics/CSV), publiée sur GitHub Pages.
- [`@access4all/cli`](packages/cli) : la commande `access4all` : scan axe-core et rapport pas à pas pour les devs, et checklists par métier.

## Démarrer

```bash
npm install
npx -w @access4all/cli playwright install chromium
npm run build
npm test
npx access4all check https://exemple.fr
npm run dev -w @access4all/web   # app web sur http://localhost:5173
```

`access4all` n'est pas publié sur npm : `npx access4all` ne fonctionne que depuis ce dépôt, après `npm install` et `npm run build`. Pour l'utiliser depuis n'importe quel dossier (par exemple dans le projet que vous testez), installez la commande une fois pour toutes :

```bash
npm link -w @access4all/cli   # puis : access4all check http://localhost:3000
```

## Pourquoi RGAA 4.1.2 + WCAG 2.2 ?

Le RGAA 4.1.2 est le référentiel opposable en France ; il repose sur les WCAG 2.1. Les WCAG 2.2 ajoutent six critères de niveau A/AA (focus non masqué, glisser-déposer, taille des cibles, aide cohérente, saisie redondante, authentification accessible). Ils sont proposés en option (`wcag22: true`) pour anticiper la prochaine version du RGAA et de la norme EN 301 549, sans fausser le taux de conformité RGAA officiel.

Voir [NOTICE.md](NOTICE.md) pour les sources et licences.
