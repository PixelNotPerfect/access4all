# @access4all/core

Socle de la boîte à outils access4all.

## Contenu

- **Référentiel** : les 106 critères du RGAA 4.1.2 avec leurs tests, la méthodologie officielle de chaque test et les correspondances WCAG, plus 9 critères WCAG 2.2 absents du RGAA (6 de niveau A/AA, 3 AAA).
- **Conseils par métier** : pour chaque critère, les métiers responsables (design, dev, contenu), la gravité (bloquant, majeur, mineur), l'effort de correction (1 à 3), la part automatisable, et un conseil concret pour chaque métier.
- **Correspondance axe-core** : 94 règles axe reliées aux critères RGAA (table d'acces-cible élargie). Toutes les règles sont vérifiées contre axe-core dans les tests.
- **Conformité** : taux global et taux moyen selon la méthode RGAA, statut légal (totalement, partiellement ou non conforme).
- **Calendrier d'actions** : obligations légales puis défauts classés par gravité, étendue et effort, répartis en lots selon la capacité de l'équipe, exportables en iCalendar (.ics) et CSV.

## Exemple

```ts
import { getCriteria, adviceFor, computeCompliance, findingsFromReport, buildActionPlan, planToIcs } from "@access4all/core";

// Checklist designer, compléments WCAG 2.2 inclus
for (const c of getCriteria({ role: "design", wcag22: true })) {
  console.log(c.id, c.impact, adviceFor(c, "design"));
}

// Audit → taux → calendrier
const pages = [
  { page: "Accueil", results: { "3.2": "NC", "1.1": "C", "11.1": "NA" } },
  { page: "Contact", results: { "3.2": "C", "11.1": "NC" } },
] as const;
const report = computeCompliance(pages as any);
console.log(report.globalRate, report.legalStatus);

const plan = buildActionPlan(findingsFromReport(report, pages as any), { startDate: "2027-01-04", capacity: 8 });
const ics = planToIcs(plan);
```

## Méthode de calcul

- Un critère est **non conforme** s'il l'est sur au moins une page de l'échantillon, **conforme** s'il est conforme sur au moins une page et non conforme sur aucune, **non applicable** s'il l'est partout.
- Taux global = critères conformes / (conformes + non conformes).
- Statut légal : 100 % → totalement conforme ; 50 % ou plus → partiellement conforme ; moins de 50 % → non conforme.
