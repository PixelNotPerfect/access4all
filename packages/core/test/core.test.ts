import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  adviceFor,
  axeRulesForCriterion,
  buildActionPlan,
  computeCompliance,
  consolidate,
  criteriaForAxeRule,
  findingsFromReport,
  getCriteria,
  getCriterion,
  getTopics,
  mappedAxeRules,
  planToCsv,
  planToIcs,
} from "../src/index.js";

const require = createRequire(import.meta.url);

describe("référentiel", () => {
  it("contient les 106 critères RGAA 4.1.2 avec conseils", () => {
    const all = getCriteria();
    expect(all).toHaveLength(106);
    for (const c of all) {
      expect(c.owners.length).toBeGreaterThan(0);
      expect(c.design || c.dev || c.content).toBeTruthy();
      expect(c.tests.length).toBeGreaterThan(0);
      expect(c.title).not.toMatch(/\]\(#/);
    }
  });

  it("chaque critère a au moins un conseil pour un métier responsable", () => {
    for (const c of getCriteria({ wcag22: true, aaa: true })) {
      expect(c.owners.some((o) => !!c[o]), c.id).toBe(true);
    }
  });

  it("ajoute les critères WCAG 2.2 de niveau A/AA, et AAA sur demande", () => {
    expect(getCriteria({ wcag22: true })).toHaveLength(106 + 6);
    expect(getCriteria({ wcag22: true, aaa: true })).toHaveLength(106 + 9);
    expect(getCriterion("WCAG-2.5.8")?.level).toBe("AA");
  });

  it("relie la méthodologie officielle aux tests", () => {
    const c = getCriterion("1.1")!;
    expect(c.tests[0].id).toBe("1.1.1");
    expect(c.tests[0].methodology).toMatch(/alternative textuelle/);
    expect(c.wcag).toContain("1.1.1 Non-text Content (A)");
    expect(c.url).toBe("https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/#1.1");
  });

  it("filtre par métier et adapte les conseils par profil", () => {
    const design = getCriteria({ role: "design" });
    expect(design.length).toBeGreaterThan(20);
    expect(design.every((c) => c.owners.includes("design"))).toBe(true);
    const c = getCriterion("3.2")!;
    expect(adviceFor(c, "design")[0]).toMatch(/4,5:1/);
    expect(adviceFor(c, "ba")[0]).toMatch(/^3\.2\.1/);
  });

  it("expose 14 thématiques", () => {
    expect(getTopics()).toHaveLength(14);
  });
});

describe("correspondance axe-core", () => {
  it("ne pointe que vers des critères existants", () => {
    for (const rule of mappedAxeRules()) {
      expect(criteriaForAxeRule(rule).length, rule).toBeGreaterThan(0);
    }
  });

  it("ne référence que des règles qui existent dans axe-core", () => {
    const axe = require("axe-core");
    const known = new Set(axe.getRules().map((r: { ruleId: string }) => r.ruleId));
    const unknown = mappedAxeRules().filter((r) => !known.has(r));
    expect(unknown).toEqual([]);
  });

  it("reprend la table d'acces-cible", () => {
    expect(criteriaForAxeRule("document-title")[0].id).toBe("8.5");
    expect(axeRulesForCriterion("11.1")).toContain("label");
  });
});

describe("conformité", () => {
  it("consolide selon la méthode RGAA", () => {
    expect(consolidate(["C", "NC", "NA"])).toBe("NC");
    expect(consolidate(["C", "NA"])).toBe("C");
    expect(consolidate(["NA", "NA"])).toBe("NA");
    expect(consolidate(["NT"])).toBe("NT");
  });

  it("calcule taux global, taux moyen et statut légal", () => {
    const ids = getCriteria().map((c) => c.id);
    const p1: Record<string, "C" | "NC" | "NA"> = {};
    const p2: Record<string, "C" | "NC" | "NA"> = {};
    ids.forEach((id, i) => {
      p1[id] = i < 60 ? "C" : i < 80 ? "NC" : "NA";
      p2[id] = i < 70 ? "C" : "NA";
    });
    const r = computeCompliance([
      { page: "Accueil", results: p1 },
      { page: "Contact", results: p2 },
    ]);
    // Critères 0-59 : C ; 60-79 : NC (p1) ; 70-79 C sur p2 mais NC sur p1 → NC ; 80+ : NA
    expect(r.counts).toEqual({ C: 60, NC: 20, NA: 26, NT: 0 });
    expect(r.globalRate).toBe(75);
    expect(r.perPage[0].rate).toBe(75);
    expect(r.perPage[1].rate).toBe(100);
    expect(r.averageRate).toBe(87.5);
    expect(r.legalStatus).toBe("partiellement conforme");
    expect(r.incomplete).toBe(false);
  });

  it("signale un audit incomplet", () => {
    const r = computeCompliance([{ page: "Accueil", results: { "1.1": "NC" } }]);
    expect(r.incomplete).toBe(true);
    expect(r.globalRate).toBe(0);
    expect(r.legalStatus).toBe("non conforme");
  });
});

describe("calendrier d'actions", () => {
  const findings = [
    { criterionId: "1.8", pages: ["Accueil"] }, // mineur
    { criterionId: "10.7", pages: ["Accueil", "Contact"] }, // bloquant, effort 1
    { criterionId: "7.1", pages: ["Accueil"] }, // bloquant, effort 3
    { criterionId: "11.13" }, // majeur
  ];

  it("priorise les défauts bloquants et les obligations légales", () => {
    const plan = buildActionPlan(findings, { startDate: "2027-01-04", capacity: 4 });
    expect(plan.items.slice(0, 4).every((i) => i.id.startsWith("legal-"))).toBe(true);
    const fixes = plan.items.filter((i) => i.criterionId).map((i) => i.criterionId);
    expect(fixes).toEqual(["10.7", "7.1", "11.13", "1.8"]);
  });

  it("répartit les actions en lots selon la capacité", () => {
    const plan = buildActionPlan(findings, { startDate: "2027-01-04", capacity: 3, sprintDays: 14, legalTasks: false });
    expect(plan.sprints.map((s) => s.items.map((i) => i.criterionId))).toEqual([["10.7"], ["7.1"], ["11.13", "1.8"]]);
    expect(plan.sprints[1].start).toBe("2027-01-18");
    expect(plan.endDate).toBe("2027-02-14");
    for (const s of plan.sprints) expect(s.load).toBeLessThanOrEqual(3);
  });

  it("refuse une date ou un critère invalide", () => {
    expect(() => buildActionPlan([], { startDate: "demain" })).toThrow(/Date invalide/);
    expect(() => buildActionPlan([{ criterionId: "99.9" }], { startDate: "2027-01-04" })).toThrow(/inconnu/);
  });

  it("chaîne rapport → défauts → calendrier", () => {
    const pages = [{ page: "Accueil", results: { "3.2": "NC" as const, "1.1": "C" as const } }];
    const plan = buildActionPlan(findingsFromReport(computeCompliance(pages), pages), { startDate: "2027-01-04", legalTasks: false });
    expect(plan.items.map((i) => i.criterionId)).toEqual(["3.2"]);
    expect(plan.items[0].pages).toEqual(["Accueil"]);
  });

  it("exporte en iCalendar valide", () => {
    const plan = buildActionPlan(findings, { startDate: "2027-01-04" });
    const ics = planToIcs(plan, { now: new Date("2027-01-01T00:00:00Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(plan.items.length);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270104");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("exporte en CSV", () => {
    const csv = planToCsv(buildActionPlan(findings, { startDate: "2027-01-04", legalTasks: false }));
    expect(csv.startsWith("﻿Lot;Début;Fin;Critère")).toBe(true);
    expect(csv.trim().split("\r\n")).toHaveLength(5);
  });
});
