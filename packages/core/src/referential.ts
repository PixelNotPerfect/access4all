import rgaaRaw from "./data/rgaa/criteres.json" with { type: "json" };
import methodologiesRaw from "./data/rgaa/methodologies.json" with { type: "json" };
import { guidance } from "./data/guidance.js";
import { wcag22Additions } from "./data/wcag22.js";
import { axeToRgaa, a4aToRgaa } from "./data/axe-rgaa.js";
import { stripMarkdown } from "./text.js";
import type { Criterion, Persona, Role, WcagLevel } from "./types.js";

/** Version du référentiel RGAA embarqué (source : DISIC, licence Ouverte 2.0). */
export const RGAA_VERSION = "4.1.2";
export const WCAG_VERSION = "2.2";
const RGAA_URL = "https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/";

interface RawCriterion {
  number: number;
  title: string;
  tests: Record<string, string[]>;
  references?: Array<Record<string, string[]>>;
}
interface RawTopic {
  topic: string;
  number: number;
  criteria: Array<{ criterium: RawCriterion }>;
}

const methodologies = methodologiesRaw as Record<string, string>;

function highestLevel(wcag: string[]): WcagLevel {
  if (wcag.some((w) => w.includes("(AAA)"))) return "AAA";
  if (wcag.some((w) => w.includes("(AA)"))) return "AA";
  return "A";
}

function buildRgaa(): Criterion[] {
  const byId = new Map(guidance.map((g) => [g.id, g]));
  const out: Criterion[] = [];
  for (const topic of (rgaaRaw as unknown as { topics: RawTopic[] }).topics) {
    for (const { criterium: c } of topic.criteria) {
      const id = `${topic.number}.${c.number}`;
      const g = byId.get(id);
      if (!g) throw new Error(`Conseils manquants pour le critère RGAA ${id}`);
      const refs = c.references ?? [];
      const wcag = refs.flatMap((r) => r.wcag ?? []);
      out.push({
        ...g,
        source: "RGAA",
        topic: { number: topic.number, title: topic.topic },
        title: stripMarkdown(c.title),
        tests: Object.entries(c.tests).map(([n, lines]) => {
          const testId = `${id}.${n}`;
          const m = methodologies[testId];
          return {
            id: testId,
            text: stripMarkdown(lines.join("\n")),
            ...(m ? { methodology: stripMarkdown(m) } : {}),
          };
        }),
        wcag,
        level: highestLevel(wcag),
        techniques: refs.flatMap((r) => r.techniques ?? []),
        url: `${RGAA_URL}#${id}`,
      });
    }
  }
  return out;
}

function buildWcag22(): Criterion[] {
  return wcag22Additions.map(({ sc, level, title, summary, test, ...g }) => ({
    ...g,
    source: "WCAG22" as const,
    topic: { number: 14, title: "Compléments WCAG 2.2" },
    title: `${title} : ${summary}`,
    tests: [{ id: `${g.id}.1`, text: test }],
    wcag: [`${sc} (${level})`],
    level,
    techniques: [],
    url: `https://www.w3.org/WAI/WCAG22/Understanding/#${sc}`,
  }));
}

const RGAA = buildRgaa();
const WCAG22 = buildWcag22();
const ALL = [...RGAA, ...WCAG22];
const INDEX = new Map(ALL.map((c) => [c.id, c]));

export interface CriteriaFilter {
  /** Inclure les critères WCAG 2.2 absents du RGAA (par défaut : niveaux A et AA). */
  wcag22?: boolean;
  /** Inclure les critères WCAG 2.2 de niveau AAA (défaut : false). */
  aaa?: boolean;
  /** Ne garder que les critères dont ce métier est responsable. */
  role?: Role;
}

/** Liste des critères : les 106 critères RGAA, plus en option les compléments WCAG 2.2. */
export function getCriteria(filter: CriteriaFilter = {}): Criterion[] {
  const { wcag22 = false, aaa = false, role } = filter;
  let list = wcag22 ? ALL.filter((c) => c.source === "RGAA" || aaa || c.level !== "AAA") : RGAA;
  if (role) list = list.filter((c) => c.owners.includes(role));
  return list;
}

export function getCriterion(id: string): Criterion | undefined {
  return INDEX.get(id);
}

/** Thématiques RGAA (1 à 13) et compléments WCAG 2.2 (14). */
export function getTopics(): Array<{ number: number; title: string; count: number }> {
  const map = new Map<number, { number: number; title: string; count: number }>();
  for (const c of ALL) {
    const t = map.get(c.topic.number) ?? { ...c.topic, count: 0 };
    t.count++;
    map.set(c.topic.number, t);
  }
  return [...map.values()];
}

/** Critères RGAA (ou WCAG 2.2) couverts par une règle axe-core ou un test complémentaire access4all (« a4a-… »). */
export function criteriaForAxeRule(ruleId: string): Criterion[] {
  return (axeToRgaa[ruleId] ?? a4aToRgaa[ruleId] ?? []).map((id) => INDEX.get(id)!).filter(Boolean);
}

/** Règles axe-core connues pour un critère. */
export function axeRulesForCriterion(id: string): string[] {
  return Object.entries(axeToRgaa)
    .filter(([, ids]) => ids.includes(id))
    .map(([rule]) => rule);
}

/** Toutes les règles axe-core reliées au référentiel. */
export function mappedAxeRules(): string[] {
  return Object.keys(axeToRgaa);
}

/**
 * Conseil adapté à un profil : le dev reçoit le conseil technique, le designer
 * le conseil de conception, le BA et l'auditeur la procédure de test.
 */
export function adviceFor(c: Criterion, persona: Persona): string[] {
  switch (persona) {
    case "dev":
      return [c.dev, c.content].filter((x): x is string => !!x);
    case "design":
      return [c.design, c.content].filter((x): x is string => !!x);
    case "ba":
    case "auditor":
      return c.tests.map((t) => `${t.id} — ${t.text}`);
  }
}
