import { RGAA_VERSION, WCAG_VERSION, adviceFor, type Criterion, type Persona } from "@access4all/core";
import type { CriterionFinding, Occurrence, PageAnalysis } from "./analyze.js";

export type Format = "text" | "markdown" | "json";

const PERSONA_LABEL: Record<Persona, string> = {
  dev: "développeur",
  design: "designer",
  ba: "recette (BA)",
  auditor: "audit",
};

const MAX_OCCURRENCES = 5;

function occurrenceLines(list: Occurrence[], md: boolean): string[] {
  const shown = list.slice(0, MAX_OCCURRENCES).map((o) =>
    md ? `  - \`${o.selector}\` — ${o.help} (${o.rule.startsWith("a4a-") ? "test" : "règle axe"} \`${o.rule}\`)` : `      • ${o.selector}  [${o.rule}] ${o.help}`,
  );
  if (list.length > MAX_OCCURRENCES) shown.push(md ? `  - … et ${list.length - MAX_OCCURRENCES} autre(s)` : `      … et ${list.length - MAX_OCCURRENCES} autre(s)`);
  return shown;
}

function stepText(n: number, f: CriterionFinding, md: boolean): string[] {
  const c = f.criterion;
  const lines: string[] = [];
  if (md) {
    lines.push(`### Étape ${n} — ${c.id} · ${c.impact}`, "", `**${c.title}**`, "");
    if (f.violations.length) lines.push(`Éléments en erreur (${f.violations.length}) :`, ...occurrenceLines(f.violations, true), "");
    if (f.toReview.length) lines.push(`À vérifier à la main (${f.toReview.length}) :`, ...occurrenceLines(f.toReview, true), "");
    lines.push(...adviceFor(c, "dev").map((a) => `> **À faire :** ${a}`), "", `[Critère ${c.id}](${c.url})`, "");
  } else {
    lines.push(`  ${n}. [${c.impact.toUpperCase()}] ${c.id} — ${c.title}`);
    if (f.violations.length) lines.push(`     Éléments en erreur (${f.violations.length}) :`, ...occurrenceLines(f.violations, false));
    if (f.toReview.length) lines.push(`     À vérifier à la main (${f.toReview.length}) :`, ...occurrenceLines(f.toReview, false));
    lines.push(...adviceFor(c, "dev").map((a) => `     → À faire : ${a}`), `     ${c.url}`, "");
  }
  return lines;
}

function checklistLines(list: Criterion[], persona: Persona, md: boolean): string[] {
  const out: string[] = [];
  let topic = -1;
  for (const c of list) {
    if (c.topic.number !== topic) {
      topic = c.topic.number;
      out.push(md ? `\n#### ${c.topic.number}. ${c.topic.title}\n` : `\n  ${c.topic.number}. ${c.topic.title}`);
    }
    const advice = persona === "ba" || persona === "auditor" ? c.tests.map((t) => `${t.id} ${t.text.split("\n")[0]}`) : adviceFor(c, persona);
    if (md) {
      out.push(`- [ ] **${c.id}** (${c.impact}) ${c.title}`);
      for (const a of advice) out.push(`  - ${a}`);
    } else {
      out.push(`    [ ] ${c.id} (${c.impact}) ${c.title}`);
      for (const a of advice) out.push(`        - ${a}`);
    }
  }
  return out;
}

export function renderChecklist(list: Criterion[], persona: Persona, format: Format): string {
  if (format === "json") return JSON.stringify(list, null, 2);
  const md = format === "markdown";
  const title = `Checklist accessibilité — ${PERSONA_LABEL[persona]} (RGAA ${RGAA_VERSION} + WCAG ${WCAG_VERSION})`;
  return [md ? `# ${title}` : title, md ? "" : "=".repeat(title.length), `${list.length} critères à vérifier.`, ...checklistLines(list, persona, md), ""].join("\n");
}

export interface CheckReport {
  analyses: PageAnalysis[];
  manual: Criterion[];
  /** Critères tranchés automatiquement (conforme ou non applicable sur tous les écrans). */
  settled?: Array<{ criterion: Criterion; status: "C" | "NA" | "C/NA"; reason: string; pages: number }>;
}

const SETTLED_LABEL = { C: "conforme", NA: "non applicable", "C/NA": "conforme ou non applicable" } as const;

export function renderCheck(report: CheckReport, format: Format): string {
  if (format === "json") {
    return JSON.stringify(
      {
        referentiel: { rgaa: RGAA_VERSION, wcag: WCAG_VERSION },
        pages: report.analyses.map((a) => ({
          url: a.url,
          failures: a.failures.map((f) => ({ criterion: f.criterion.id, impact: f.criterion.impact, title: f.criterion.title, violations: f.violations, toReview: f.toReview, advice: adviceFor(f.criterion, "dev"), url: f.criterion.url })),
          reviews: a.reviews.map((f) => ({ criterion: f.criterion.id, toReview: f.toReview })),
          unmapped: a.unmapped,
          passedCriteria: a.passedCriteria,
          verdicts: a.verdicts.map(({ criterion, status, reason }) => ({ criterion, status, reason })),
        })),
        autoVerified: (report.settled ?? []).map((s) => ({ criterion: s.criterion.id, status: s.status, reason: s.reason })),
        manualChecks: report.manual.map((c) => c.id),
      },
      null,
      2,
    );
  }
  const md = format === "markdown";
  const out: string[] = [];
  const title = `Vérification accessibilité avant recette — RGAA ${RGAA_VERSION} + WCAG ${WCAG_VERSION}`;
  out.push(md ? `# ${title}` : title, md ? "" : "=".repeat(title.length));

  for (const a of report.analyses) {
    const counts = { bloquant: 0, majeur: 0, mineur: 0 };
    for (const f of a.failures) counts[f.criterion.impact]++;
    out.push(md ? `\n## ${a.url}\n` : `\nPage : ${a.url}`);
    out.push(
      a.failures.length
        ? `${a.failures.length} critère(s) en échec : ${counts.bloquant} bloquant(s), ${counts.majeur} majeur(s), ${counts.mineur} mineur(s).`
        : "Aucune erreur détectée automatiquement. Pensez aux vérifications manuelles ci-dessous.",
    );
    if (a.failures.length) {
      out.push(md ? "\nCorrigez dans cet ordre (du plus grave au plus rapide) :\n" : "\nCorrigez dans cet ordre (du plus grave au plus rapide) :\n");
      a.failures.forEach((f, i) => out.push(...stepText(i + 1, f, md)));
    }
    if (a.reviews.length) {
      out.push(md ? "### Points à confirmer à la main\n" : "  Points à confirmer à la main :");
      for (const f of a.reviews) {
        out.push(md ? `- **${f.criterion.id}** ${f.criterion.title} (${f.toReview.length} élément(s))` : `    ? ${f.criterion.id} ${f.criterion.title} (${f.toReview.length} élément(s))`);
      }
    }
    if (a.unmapped.length) {
      out.push(md ? "\n### Autres erreurs axe-core\n" : "\n  Autres erreurs axe-core :", ...occurrenceLines(a.unmapped, md));
    }
  }

  const settled = report.settled ?? [];
  if (settled.length) {
    out.push(
      md ? "\n## Vérifié automatiquement\n" : "\nVérifié automatiquement (plus de vérification manuelle)",
      ...settled.map((s) => (md ? `- **${s.criterion.id}** ${SETTLED_LABEL[s.status]} — ${s.reason}` : `    ✓ ${s.criterion.id} ${SETTLED_LABEL[s.status]} — ${s.reason}`)),
    );
  }
  if (report.manual.length) {
    out.push(
      md ? "\n## Vérifications manuelles avant recette\n" : "\nVérifications manuelles avant recette",
      `Un outil automatique ne détecte qu'une partie des problèmes. Vérifiez aussi ces ${report.manual.length} critères :`,
      ...checklistLines(report.manual, "dev", md),
    );
  }
  return out.join("\n") + "\n";
}
