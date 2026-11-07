import { criteriaForAxeRule, getCriteria, type Criterion, type Impact, type Persona } from "@access4all/core";

/** Sous-ensemble du format de résultat d'axe-core utilisé ici. */
export interface AxeNode {
  target: unknown[];
  html: string;
  failureSummary?: string;
  /** Données de contrôle axe (ex. fgColor, bgColor, contrastRatio). */
  data?: Record<string, unknown>;
  /** Capture de l'élément encadré (data URI), si demandée. */
  screenshot?: string;
  /** visible : capturé ; hidden : sans rendu à l'écran ; page : concerne la page entière. */
  visibility?: "visible" | "hidden" | "page";
}
export interface AxeRuleResult {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
}
export interface AxeResults {
  url: string;
  title?: string;
  /** Erreur de chargement : la page n'a pas pu être scannée. */
  error?: string;
  violations: AxeRuleResult[];
  incomplete: AxeRuleResult[];
  passes: AxeRuleResult[];
}

export interface Occurrence {
  rule: string;
  help: string;
  helpUrl: string;
  selector: string;
  html: string;
  summary?: string;
  /** Code HTML complet de l'élément (jusqu'à 1 000 caractères). */
  fullHtml: string;
  data?: Record<string, unknown>;
  screenshot?: string;
  visibility?: "visible" | "hidden" | "page";
}

export interface CriterionFinding {
  criterion: Criterion;
  /** Violations avérées. */
  violations: Occurrence[];
  /** Éléments qu'axe n'a pas pu trancher : à vérifier à la main. */
  toReview: Occurrence[];
}

export interface PageAnalysis {
  url: string;
  title?: string;
  error?: string;
  /** Critères en échec, du plus grave au plus simple à corriger. */
  failures: CriterionFinding[];
  /** Critères avec des éléments à vérifier manuellement (sans violation avérée). */
  reviews: CriterionFinding[];
  /** Règles axe en échec qui ne correspondent à aucun critère (rare). */
  unmapped: Occurrence[];
  /** Critères vérifiés automatiquement sans erreur (succès axe, à confirmer). */
  passedCriteria: string[];
}

const IMPACT_ORDER: Record<Impact, number> = { bloquant: 0, majeur: 1, mineur: 2 };

function toOccurrences(r: AxeRuleResult): Occurrence[] {
  return r.nodes.map((n) => ({
    rule: r.id,
    help: r.help,
    helpUrl: r.helpUrl,
    selector: n.target.map(String).join(" "),
    html: n.html.length > 200 ? `${n.html.slice(0, 197)}…` : n.html,
    summary: n.failureSummary,
    fullHtml: n.html.length > 1000 ? `${n.html.slice(0, 999)}…` : n.html,
    ...(n.data ? { data: n.data } : {}),
    ...(n.screenshot ? { screenshot: n.screenshot } : {}),
    ...(n.visibility ? { visibility: n.visibility } : {}),
  }));
}

function group(results: AxeRuleResult[], wcag22: boolean) {
  const map = new Map<string, { criterion: Criterion; items: Occurrence[] }>();
  const unmapped: Occurrence[] = [];
  for (const r of results) {
    const all = criteriaForAxeRule(r.id);
    if (all.length === 0) {
      unmapped.push(...toOccurrences(r));
      continue;
    }
    const criteria = all.filter((c) => wcag22 || c.source === "RGAA");
    for (const c of criteria) {
      const entry = map.get(c.id) ?? { criterion: c, items: [] };
      entry.items.push(...toOccurrences(r));
      map.set(c.id, entry);
    }
  }
  return { map, unmapped };
}

function sortFindings(a: CriterionFinding, b: CriterionFinding): number {
  return (
    IMPACT_ORDER[a.criterion.impact] - IMPACT_ORDER[b.criterion.impact] ||
    a.criterion.effort - b.criterion.effort ||
    b.violations.length - a.violations.length ||
    a.criterion.topic.number - b.criterion.topic.number
  );
}

/** Regroupe les résultats axe-core par critère RGAA et les classe par priorité. */
export function analyze(results: AxeResults, options: { wcag22?: boolean } = {}): PageAnalysis {
  const wcag22 = options.wcag22 ?? true;
  const v = group(results.violations, wcag22);
  const inc = group(results.incomplete, wcag22);
  const p = group(results.passes, wcag22);

  const failures: CriterionFinding[] = [...v.map.values()].map(({ criterion, items }) => ({
    criterion,
    violations: items,
    toReview: inc.map.get(criterion.id)?.items ?? [],
  }));
  const reviews: CriterionFinding[] = [...inc.map.values()]
    .filter(({ criterion }) => !v.map.has(criterion.id))
    .map(({ criterion, items }) => ({ criterion, violations: [], toReview: items }));

  return {
    url: results.url,
    title: results.title,
    ...(results.error ? { error: results.error } : {}),
    failures: failures.sort(sortFindings),
    reviews: reviews.sort(sortFindings),
    unmapped: v.unmapped,
    passedCriteria: [...p.map.keys()].filter((id) => !v.map.has(id) && !inc.map.has(id)),
  };
}

/**
 * Vérifications manuelles à faire avant la recette, pour un profil donné :
 * tous les critères qui ne sont pas entièrement automatisables, sauf ceux
 * déjà signalés en échec par le scan.
 */
export function manualChecklist(persona: Persona, opts: { wcag22?: boolean; exclude?: Iterable<string> } = {}): Criterion[] {
  const exclude = new Set(opts.exclude ?? []);
  const role = persona === "dev" || persona === "design" ? persona : undefined;
  return getCriteria({ wcag22: opts.wcag22 ?? true, role })
    .filter((c) => (persona === "ba" || persona === "auditor" ? true : c.automation !== "auto"))
    .filter((c) => !exclude.has(c.id))
    .sort((a, b) => a.topic.number - b.topic.number || IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
}

/** Vrai si au moins un critère en échec atteint le seuil de gravité donné. */
export function exceedsThreshold(analyses: PageAnalysis[], threshold: Impact | "aucun"): boolean {
  if (threshold === "aucun") return false;
  return analyses.some((a) => a.failures.some((f) => IMPACT_ORDER[f.criterion.impact] <= IMPACT_ORDER[threshold]));
}
