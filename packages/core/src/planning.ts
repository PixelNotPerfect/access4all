import { getCriterion } from "./referential.js";
import type { ComplianceReport } from "./compliance.js";
import type { Effort, Impact, Role } from "./types.js";

export interface Finding {
  criterionId: string;
  /** Pages concernées : plus un défaut est répandu, plus il est prioritaire. */
  pages?: string[];
  /** Précision libre (ex. composant en cause). */
  note?: string;
}

export interface PlanOptions {
  /** Date de début au format AAAA-MM-JJ. */
  startDate: string;
  /** Durée d'un lot (sprint) en jours. Défaut : 14. */
  sprintDays?: number;
  /** Capacité d'un lot en points d'effort (1 à 3 par action). Défaut : 8. */
  capacity?: number;
  /** Ajouter les obligations légales (déclaration, schéma pluriannuel…). Défaut : true. */
  legalTasks?: boolean;
}

export interface ActionItem {
  id: string;
  /** Critère RGAA / WCAG traité, absent pour une obligation légale. */
  criterionId?: string;
  title: string;
  owners: Array<Role | "pilotage">;
  impact: Impact;
  effort: Effort;
  pages: string[];
  advice: string[];
  url?: string;
  sprint: number;
  start: string;
  end: string;
}

export interface ActionPlan {
  startDate: string;
  endDate: string;
  sprintDays: number;
  sprints: Array<{ number: number; start: string; end: string; items: ActionItem[]; load: number }>;
  items: ActionItem[];
}

const IMPACT_WEIGHT: Record<Impact, number> = { bloquant: 3, majeur: 2, mineur: 1 };

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Date invalide : ${iso} (format attendu AAAA-MM-JJ)`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Obligations légales françaises (loi n° 2005-102, article 47 ; décret n° 2019-768),
 * celles que vérifie acces-cible.
 */
const LEGAL_TASKS: Array<Omit<ActionItem, "sprint" | "start" | "end" | "pages">> = [
  { id: "legal-declaration", title: "Publier ou mettre à jour la déclaration d'accessibilité (état de conformité, résultats, contenus non accessibles, contact, voies de recours)",
    owners: ["pilotage"], impact: "bloquant", effort: 1, advice: ["Modèle et obligations : https://accessibilite.numerique.gouv.fr/obligations/declaration-accessibilite/"] },
  { id: "legal-mention", title: "Afficher la mention « Accessibilité : non / partiellement / totalement conforme » sur toutes les pages, avec un lien vers la déclaration",
    owners: ["pilotage", "dev"], impact: "bloquant", effort: 1, advice: ["Placer la mention dans le pied de page commun."] },
  { id: "legal-schema", title: "Publier le schéma pluriannuel de mise en accessibilité (3 ans maximum)",
    owners: ["pilotage"], impact: "majeur", effort: 2, advice: ["Le schéma décrit la politique, les moyens et l'organisation ; il est accessible depuis la déclaration."] },
  { id: "legal-plan", title: "Publier le plan d'actions de l'année en cours (issu de ce calendrier)",
    owners: ["pilotage"], impact: "majeur", effort: 1, advice: ["Exporter ce calendrier et le joindre au schéma pluriannuel."] },
];

/** Trie les défauts : impact décroissant, puis nombre de pages, puis effort croissant (gains rapides d'abord). */
function compareItems(a: Omit<ActionItem, "sprint" | "start" | "end">, b: Omit<ActionItem, "sprint" | "start" | "end">) {
  return (
    IMPACT_WEIGHT[b.impact] - IMPACT_WEIGHT[a.impact] ||
    b.pages.length - a.pages.length ||
    a.effort - b.effort ||
    0
  );
}

/** Transforme un rapport de conformité en liste de défauts (critères non conformes). */
export function findingsFromReport(report: ComplianceReport, pageResults?: Array<{ page: string; results: Record<string, string> }>): Finding[] {
  return Object.entries(report.criteria)
    .filter(([, s]) => s === "NC")
    .map(([criterionId]) => ({
      criterionId,
      pages: pageResults?.filter((p) => p.results[criterionId] === "NC").map((p) => p.page) ?? [],
    }));
}

/**
 * Construit le calendrier d'actions : obligations légales d'abord, puis défauts
 * classés par priorité, répartis en lots selon la capacité de l'équipe.
 */
export function buildActionPlan(findings: Finding[], options: PlanOptions): ActionPlan {
  const sprintDays = options.sprintDays ?? 14;
  const capacity = Math.max(1, options.capacity ?? 8);
  addDays(options.startDate, 0); // valide la date

  const fixes = findings.map((f) => {
    const c = getCriterion(f.criterionId);
    if (!c) throw new Error(`Critère inconnu : ${f.criterionId}`);
    return {
      id: `fix-${c.id}`,
      criterionId: c.id,
      title: `${c.id} — ${c.title}${f.note ? ` (${f.note})` : ""}`,
      owners: c.owners,
      impact: c.impact,
      effort: c.effort,
      pages: f.pages ?? [],
      advice: [c.design, c.dev, c.content].filter((x): x is string => !!x),
      url: c.url,
    };
  });
  fixes.sort(compareItems);
  const queue = [...(options.legalTasks === false ? [] : LEGAL_TASKS.map((t) => ({ ...t, pages: [] }))), ...fixes];

  const sprints: ActionPlan["sprints"] = [];
  let current: ActionPlan["sprints"][number] | undefined;
  for (const item of queue) {
    if (!current || (current.load > 0 && current.load + item.effort > capacity)) {
      const n = sprints.length;
      current = { number: n + 1, start: addDays(options.startDate, n * sprintDays), end: addDays(options.startDate, (n + 1) * sprintDays - 1), items: [], load: 0 };
      sprints.push(current);
    }
    current.items.push({ ...item, sprint: current.number, start: current.start, end: current.end });
    current.load += item.effort;
  }

  return {
    startDate: options.startDate,
    endDate: sprints.at(-1)?.end ?? options.startDate,
    sprintDays,
    sprints,
    items: sprints.flatMap((s) => s.items),
  };
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Replie les lignes iCalendar à 75 octets (RFC 5545). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (new TextEncoder().encode(cur + ch).length > limit) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** Exporte le calendrier au format iCalendar (.ics), un événement par action. */
export function planToIcs(plan: ActionPlan, opts: { name?: string; now?: Date } = {}): string {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//access4all//plan-actions//FR",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(opts.name ?? "Plan d'actions accessibilité")}`,
  ];
  for (const it of plan.items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.id}-${plan.startDate}@access4all`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${it.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(it.end, 1).replace(/-/g, "")}`,
      `SUMMARY:${icsEscape(`[${it.impact}] ${it.title}`)}`,
      `DESCRIPTION:${icsEscape([`Lot ${it.sprint} · Responsables : ${it.owners.join(", ")} · Effort : ${it.effort}/3`, ...(it.pages.length ? [`Pages : ${it.pages.join(", ")}`] : []), ...it.advice, ...(it.url ? [it.url] : [])].join("\n"))}`,
      `CATEGORIES:${icsEscape(it.owners.join(","))}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Exporte le calendrier en CSV (séparateur « ; », compatible Excel en français). */
export function planToCsv(plan: ActionPlan): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Lot", "Début", "Fin", "Critère", "Action", "Impact", "Effort", "Responsables", "Pages", "Conseils", "Référence"];
  const rows = plan.items.map((it) => [
    it.sprint, it.start, it.end, it.criterionId ?? "Obligation légale", it.title, it.impact, it.effort,
    it.owners.join(", "), it.pages.join(", "), it.advice.join(" / "), it.url ?? "",
  ]);
  return "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}
