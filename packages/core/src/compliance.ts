import { getCriteria } from "./referential.js";
import type { Status } from "./types.js";

export interface PageAudit {
  /** Nom ou URL de la page de l'échantillon. */
  page: string;
  /** Statut de chaque critère sur cette page. Un critère absent vaut « NT » (non testé). */
  results: Record<string, Status>;
}

export interface Counts {
  C: number;
  NC: number;
  NA: number;
  NT: number;
}

export type LegalStatus = "totalement conforme" | "partiellement conforme" | "non conforme";

export interface ComplianceReport {
  /** Statut consolidé de chaque critère sur l'échantillon. */
  criteria: Record<string, Status>;
  counts: Counts;
  /** Taux de conformité global RGAA : C / (C + NC), en %, arrondi à 2 décimales. */
  globalRate: number | null;
  /** Taux moyen : moyenne des taux de chaque page. */
  averageRate: number | null;
  perPage: Array<{ page: string; counts: Counts; rate: number | null }>;
  perTopic: Array<{ topic: number; counts: Counts; rate: number | null }>;
  /** Mention à afficher dans la déclaration d'accessibilité et le pied de page. */
  legalStatus: LegalStatus | null;
  /** Vrai si au moins un critère n'a été testé sur aucune page. */
  incomplete: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const rate = (c: Counts) => (c.C + c.NC === 0 ? null : round2((c.C / (c.C + c.NC)) * 100));
const empty = (): Counts => ({ C: 0, NC: 0, NA: 0, NT: 0 });

/**
 * Consolide le statut d'un critère sur l'échantillon, selon la méthode RGAA :
 * non conforme s'il l'est sur au moins une page, conforme s'il est conforme
 * sur au moins une page et non conforme sur aucune, non applicable s'il l'est
 * partout où il a été testé.
 */
export function consolidate(statuses: Status[]): Status {
  if (statuses.includes("NC")) return "NC";
  if (statuses.includes("C")) return "C";
  if (statuses.includes("NA")) return "NA";
  return "NT";
}

export function legalStatusFor(globalRate: number | null): LegalStatus | null {
  if (globalRate === null) return null;
  if (globalRate === 100) return "totalement conforme";
  if (globalRate >= 50) return "partiellement conforme";
  return "non conforme";
}

/** Calcule les taux de conformité RGAA à partir des résultats page par page. */
export function computeCompliance(
  pages: PageAudit[],
  options: { wcag22?: boolean } = {},
): ComplianceReport {
  const criteria = getCriteria({ wcag22: options.wcag22 });
  const consolidated: Record<string, Status> = {};
  const counts = empty();
  const topicCounts = new Map<number, Counts>();

  for (const c of criteria) {
    const s = consolidate(pages.map((p) => p.results[c.id] ?? "NT"));
    consolidated[c.id] = s;
    counts[s]++;
    const t = topicCounts.get(c.topic.number) ?? empty();
    t[s]++;
    topicCounts.set(c.topic.number, t);
  }

  const perPage = pages.map((p) => {
    const pc = empty();
    for (const c of criteria) pc[p.results[c.id] ?? "NT"]++;
    return { page: p.page, counts: pc, rate: rate(pc) };
  });
  const pageRates = perPage.map((p) => p.rate).filter((r): r is number => r !== null);
  const globalRate = rate(counts);

  return {
    criteria: consolidated,
    counts,
    globalRate,
    averageRate: pageRates.length ? round2(pageRates.reduce((a, b) => a + b, 0) / pageRates.length) : null,
    perPage,
    perTopic: [...topicCounts.entries()].map(([topic, c]) => ({ topic, counts: c, rate: rate(c) })),
    legalStatus: legalStatusFor(globalRate),
    incomplete: counts.NT > 0,
  };
}
