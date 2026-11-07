import type { Impact } from "@access4all/core";
import type { CriterionFinding, Occurrence, PageAnalysis } from "./analyze.js";

/**
 * Regroupement des résultats de plusieurs écrans d'un même produit : un élément
 * identique présent sur plusieurs écrans (en-tête, menu, pied de page, composant
 * partagé) est un problème commun, à corriger une seule fois.
 */
export interface Consolidated {
  /** Critères en échec à cause d'éléments présents sur au moins deux écrans. */
  shared: CriterionFinding[];
  /** Pour chaque élément commun (clé), les index des écrans où il apparaît. */
  sharedPages: Map<string, number[]>;
  /** Analyses par écran, sans les éléments communs. */
  pages: PageAnalysis[];
}

const IMPACT_ORDER: Record<Impact, number> = { bloquant: 0, majeur: 1, mineur: 2 };

/**
 * Un même élément d'un écran à l'autre : même règle et même code HTML. Le sélecteur
 * n'entre pas en compte car il change dès que la structure de la page varie
 * (ex. « p:nth-child(3) » au lieu de « p »).
 */
export function occurrenceKey(o: Occurrence): string {
  return `${o.rule}|${o.fullHtml ?? o.html}`;
}

export function consolidate(analyses: PageAnalysis[]): Consolidated {
  const pagesOf = new Map<string, Set<number>>();
  analyses.forEach((a, i) => {
    for (const f of a.failures) for (const o of f.violations) {
      const k = occurrenceKey(o);
      pagesOf.set(k, (pagesOf.get(k) ?? new Set()).add(i));
    }
  });
  const sharedPages = new Map<string, number[]>();
  if (analyses.length > 1) for (const [k, s] of pagesOf) if (s.size > 1) sharedPages.set(k, [...s].sort((x, y) => x - y));

  // Problèmes communs, regroupés par critère, une seule occurrence par élément
  // (en gardant celle qui a une capture).
  const byCriterion = new Map<string, { finding: CriterionFinding; occ: Map<string, Occurrence> }>();
  for (const a of analyses) {
    for (const f of a.failures) {
      for (const o of f.violations) {
        const k = occurrenceKey(o);
        if (!sharedPages.has(k)) continue;
        const entry = byCriterion.get(f.criterion.id) ?? { finding: { criterion: f.criterion, violations: [], toReview: [] }, occ: new Map() };
        const prev = entry.occ.get(k);
        if (!prev || (!prev.screenshot && o.screenshot)) entry.occ.set(k, o);
        byCriterion.set(f.criterion.id, entry);
      }
    }
  }
  const spread = (o: Occurrence) => sharedPages.get(occurrenceKey(o))?.length ?? 0;
  const shared = [...byCriterion.values()]
    .map(({ finding, occ }) => ({ ...finding, violations: [...occ.values()].sort((x, y) => spread(y) - spread(x)) }))
    .sort(
      (a, b) =>
        IMPACT_ORDER[a.criterion.impact] - IMPACT_ORDER[b.criterion.impact] ||
        Math.max(...b.violations.map(spread)) - Math.max(...a.violations.map(spread)) ||
        a.criterion.effort - b.criterion.effort,
    );

  const pages = analyses.map((a) => {
    const failures: CriterionFinding[] = [];
    const reviews = [...a.reviews];
    for (const f of a.failures) {
      const own = f.violations.filter((o) => !sharedPages.has(occurrenceKey(o)));
      if (own.length) failures.push({ ...f, violations: own });
      else if (f.toReview.length) reviews.push({ ...f, violations: [] });
    }
    return { ...a, failures, reviews };
  });

  return { shared, sharedPages, pages };
}
