# access4all

Boîte à outils d'accessibilité numérique fondée sur le **RGAA 4.1.2**, complété par les **WCAG 2.2**, et sur l'outil [acces-cible](https://github.com/betagouv/acces-cible) de beta.gouv.fr.

Elle s'adresse à quatre profils :

| Profil | Besoin | Outil |
|---|---|---|
| Développeur | Savoir pas à pas quoi corriger dans son code avant la recette | CLI `access4all check` *(à venir)* |
| Designer | Repérer ce qui n'est pas accessible dans ses maquettes avant de les livrer | Checklist de revue de maquettes *(à venir)* |
| BA / recette | Dérouler une recette accessibilité guidée | Grille de recette *(à venir)* |
| Tout métier | Auditer un site, obtenir un rapport et un calendrier d'actions | Module d'audit *(à venir)* |

## Paquets

- [`@access4all/core`](packages/core) : le socle commun. Référentiel RGAA 4.1.2 + compléments WCAG 2.2, conseils par métier, correspondance axe-core, calcul du taux de conformité et calendrier d'actions (export .ics et CSV).

## Démarrer

```bash
npm install
npm test
npm run build
```

## Pourquoi RGAA 4.1.2 + WCAG 2.2 ?

Le RGAA 4.1.2 est le référentiel opposable en France ; il repose sur les WCAG 2.1. Les WCAG 2.2 ajoutent six critères de niveau A/AA (focus non masqué, glisser-déposer, taille des cibles, aide cohérente, saisie redondante, authentification accessible). Ils sont proposés en option (`wcag22: true`) pour anticiper la prochaine version du RGAA et de la norme EN 301 549, sans fausser le taux de conformité RGAA officiel.

Voir [NOTICE.md](NOTICE.md) pour les sources et licences.
