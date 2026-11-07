import { describe, expect, it } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, exceedsThreshold, manualChecklist, type AxeResults } from "../src/analyze.js";
import { renderCheck, renderChecklist } from "../src/render.js";
import { scanUrls } from "../src/scan.js";
import { renderHtmlReport } from "../src/render-html.js";
import { defaultReportPath, REPORTS_DIR } from "../src/index.js";
import { consolidate } from "../src/consolidate.js";
import { parseSitemap, resolvePages } from "../src/product.js";
import { closestCompliantColor, contrastRatio, ruleFixes, setAttr } from "../src/fixes.js";

const fixture = (name: string) => pathToFileURL(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))).href;

const sample: AxeResults = {
  url: "https://exemple.fr/",
  violations: [
    { id: "color-contrast", impact: "serious", help: "Contraste", helpUrl: "", nodes: [{ target: ["p"], html: "<p>x</p>" }] },
    { id: "label", impact: "critical", help: "Étiquette", helpUrl: "", nodes: [{ target: ["#a"], html: "<input>" }, { target: ["#b"], html: "<input>" }] },
    { id: "page-has-heading-one", impact: "moderate", help: "h1", helpUrl: "", nodes: [{ target: ["html"], html: "<html>" }] },
    { id: "target-size", impact: "serious", help: "Cible", helpUrl: "", nodes: [{ target: ["a"], html: "<a>" }] },
    { id: "regle-inconnue", impact: "minor", help: "?", helpUrl: "", nodes: [{ target: ["div"], html: "<div>" }] },
  ],
  incomplete: [{ id: "color-contrast", impact: "serious", help: "Contraste", helpUrl: "", nodes: [{ target: ["span"], html: "<span>" }] }],
  passes: [{ id: "document-title", help: "", helpUrl: "", nodes: [] }],
};

describe("analyse des résultats axe", () => {
  it("regroupe par critère RGAA et trie par gravité puis effort", () => {
    const a = analyze(sample);
    expect(a.failures.map((f) => f.criterion.id)).toEqual(["11.1", "3.2", "9.1", "WCAG-2.5.8"]);
    const label = a.failures.find((f) => f.criterion.id === "11.1")!;
    expect(label.violations).toHaveLength(2);
    expect(a.failures.find((f) => f.criterion.id === "3.2")!.toReview).toHaveLength(1);
    expect(a.unmapped.map((o) => o.rule)).toEqual(["regle-inconnue"]);
    expect(a.passedCriteria).toEqual(["8.5"]);
  });

  it("peut se limiter au RGAA", () => {
    const a = analyze(sample, { wcag22: false });
    expect(a.failures.map((f) => f.criterion.id)).not.toContain("WCAG-2.5.8");
    expect(a.unmapped.map((o) => o.rule)).toEqual(["regle-inconnue"]);
  });

  it("applique le seuil d'échec", () => {
    const a = analyze(sample);
    expect(exceedsThreshold([a], "bloquant")).toBe(true);
    expect(exceedsThreshold([a], "aucun")).toBe(false);
    const onlyMinor = analyze({ ...sample, violations: [], incomplete: [] });
    expect(exceedsThreshold([onlyMinor], "mineur")).toBe(false);
  });
});

describe("checklists par métier", () => {
  it("dev : critères non entièrement automatisables, sans ceux déjà en échec", () => {
    const list = manualChecklist("dev", { exclude: ["7.3"] });
    expect(list.every((c) => c.owners.includes("dev") && c.automation !== "auto")).toBe(true);
    expect(list.map((c) => c.id)).not.toContain("7.3");
    const topics = list.map((c) => c.topic.number);
    expect(topics).toEqual([...topics].sort((x, y) => x - y));
  });

  it("design : critères dont le designer est responsable, avec compléments WCAG 2.2", () => {
    const ids = manualChecklist("design").map((c) => c.id);
    expect(ids).toContain("3.2");
    expect(ids).toContain("WCAG-2.5.8");
    expect(ids).not.toContain("8.3");
  });

  it("ba : tous les critères avec leurs tests", () => {
    const list = manualChecklist("ba");
    expect(list).toHaveLength(112);
    const md = renderChecklist(list, "ba", "markdown");
    expect(md).toContain("- [ ] **1.1**");
    expect(md).toContain("1.1.1 Chaque image");
  });
});

describe("rendu", () => {
  it("produit des étapes numérotées avec le conseil dev", () => {
    const text = renderCheck({ analyses: [analyze(sample)], manual: [] }, "text");
    expect(text).toContain("1. [BLOQUANT] 11.1");
    expect(text).toContain("→ À faire :");
    const md = renderCheck({ analyses: [analyze(sample)], manual: manualChecklist("dev").slice(0, 2) }, "markdown");
    expect(md).toContain("### Étape 1 — 11.1 · bloquant");
    expect(md).toContain("## Vérifications manuelles avant recette");
    const json = JSON.parse(renderCheck({ analyses: [analyze(sample)], manual: [] }, "json"));
    expect(json.pages[0].failures[0].criterion).toBe("11.1");
  });
});

describe("scan réel avec Chromium", () => {
  it("détecte les erreurs d'une page inaccessible et aucune sur une page correcte", async () => {
    const [bad, good] = await scanUrls([fixture("inaccessible.html"), fixture("accessible.html")]);
    const ids = analyze(bad).failures.map((f) => f.criterion.id);
    for (const id of ["1.1", "3.2", "6.2", "8.3", "8.5", "11.1", "11.9"]) expect(ids, id).toContain(id);
    expect(analyze(good).failures).toEqual([]);
  }, 60_000);
});

describe("corrections proposées", () => {
  it("réécrit la balise ouvrante", () => {
    expect(setAttr('<img src="a.png">', "alt", "")).toBe('<img src="a.png" alt="">');
    expect(setAttr('<input tabindex="3" id="x">', "tabindex", "0")).toBe('<input tabindex="0" id="x">');
  });

  it("propose la couleur conforme la plus proche", () => {
    const c = closestCompliantColor("#aaaaaa", "#ffffff", 4.5)!;
    expect(contrastRatio(c, "#ffffff")!).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c, "#ffffff")!).toBeLessThan(4.8);
  });

  it("propose un champ étiqueté avec autocomplete", () => {
    const o = { rule: "label", help: "", helpUrl: "", selector: "#email", html: "", fullHtml: '<input type="email" id="email">' };
    expect(ruleFixes.label.suggest!(o)).toBe('<label for="email">[Intitulé du champ]</label>\n<input type="email" id="email" autocomplete="email">');
  });
});

describe("rapport HTML", () => {
  it("détaille chaque élément : état actuel, problème, à faire, pourquoi", () => {
    const withData: AxeResults = {
      ...sample,
      title: "Accueil",
      violations: [
        { id: "color-contrast", impact: "serious", help: "Contraste", helpUrl: "", nodes: [{ target: ["p"], html: "<p>x</p>", data: { fgColor: "#aaaaaa", bgColor: "#ffffff", contrastRatio: 2.32, expectedContrastRatio: "4.5:1" } }] },
        { id: "image-alt", impact: "critical", help: "Images", helpUrl: "", nodes: [{ target: ["img"], html: '<img src="logo.png">', screenshot: "data:image/jpeg;base64,AAAA", visibility: "visible" }] },
        { id: "html-has-lang", impact: "serious", help: "Langue", helpUrl: "", nodes: [{ target: ["html"], html: "<html>", visibility: "page" }] },
      ],
    };
    const html = renderHtmlReport({ analyses: [analyze(withData)], manual: manualChecklist("dev").slice(0, 3) }, { generatedAt: new Date(0) });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("<title>Rapport d'accessibilité – Accueil</title>");
    for (const t of ["État actuel", "Problème", "À faire", "Pourquoi"]) expect(html).toContain(`<dt>${t}</dt>`);
    expect(html).toContain("alt=&quot;[information transmise par l'image]&quot;");
    expect(html).toContain('<img src="data:image/jpeg;base64,AAAA" alt="Capture de l\'élément img');
    expect(html).toContain("#aaaaaa à #");
    expect(html).toContain("concerne la page entière");
    expect(html).toContain('id="manuel"');
    expect(html).not.toContain("<script");
  });
});

describe("rapport HTML avec captures (Chromium)", () => {
  it("capture les éléments visibles en erreur", async () => {
    const [bad] = await scanUrls([fixture("inaccessible.html")], { screenshots: true });
    const nodes = bad.violations.flatMap((v) => v.nodes);
    expect(nodes.some((n) => n.screenshot?.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(bad.violations.find((v) => v.id === "html-has-lang")!.nodes[0].visibility).toBe("page");
    const contrast = bad.violations.find((v) => v.id === "color-contrast")!.nodes[0];
    expect(contrast.data).toMatchObject({ fgColor: "#aaaaaa", bgColor: "#ffffff" });
    const html = renderHtmlReport({ analyses: [analyze(bad)], manual: [] });
    expect(html).toContain("data:image/jpeg;base64,");
  }, 60_000);
});

describe("emplacement du rapport HTML", () => {
  it("range le rapport hors du code, par domaine et par date", () => {
    const d = new Date(2026, 10, 7, 9, 5);
    expect(defaultReportPath("https://www.client1.fr/contact", d)).toBe(`${REPORTS_DIR}/client1.fr/2026-11-07_09h05.html`);
    expect(defaultReportPath("file:///tmp/page.html", d)).toBe(`${REPORTS_DIR}/fichiers-locaux/2026-11-07_09h05.html`);
  });
});

describe("produits de plusieurs écrans", () => {
  const page = (url: string, extra: AxeResults["violations"] = []): AxeResults => ({
    url,
    violations: [
      { id: "link-name", impact: "serious", help: "Lien", helpUrl: "", nodes: [{ target: ["header a"], html: '<a href="/panier"><svg></svg></a>' }] },
      ...extra,
    ],
    incomplete: [],
    passes: [],
  });

  it("isole les problèmes communs à plusieurs écrans", () => {
    const a = page("https://c.fr/");
    const b = page("https://c.fr/contact", [{ id: "label", impact: "critical", help: "", helpUrl: "", nodes: [{ target: ["#email"], html: '<input id="email">' }] }]);
    // Même élément, sélecteur différent : reste un problème commun.
    const c = page("https://c.fr/panier");
    c.violations[0].nodes[0].target = ["div:nth-child(2) > a"];
    const { shared, sharedPages, pages } = consolidate([a, b, c].map((r) => analyze(r)));
    expect(shared.map((f) => f.criterion.id)).toEqual(["6.2"]);
    expect(shared[0].violations).toHaveLength(1);
    expect([...sharedPages.values()][0]).toEqual([0, 1, 2]);
    expect(pages[0].failures).toEqual([]);
    expect(pages[1].failures.map((f) => f.criterion.id)).toEqual(["11.1"]);

    const html = renderHtmlReport({ analyses: [a, b, c].map((r) => analyze(r)), manual: [] }, { productName: "Client1" });
    expect(html).toContain("<title>Rapport d'accessibilité – Client1</title>");
    expect(html).toContain('id="communs"');
    expect(html).toContain("Présent sur 3 écrans");
  });

  it("signale un écran qui n'a pas pu être chargé sans arrêter le rapport", () => {
    const html = renderHtmlReport({ analyses: [analyze(page("https://c.fr/")), analyze({ url: "https://c.fr/x", violations: [], incomplete: [], passes: [], error: "net::ERR" })], manual: [] });
    expect(html).toContain("Écran non scanné");
  });

  it("lit un sitemap et applique les exclusions", async () => {
    const xml = "<urlset><url><loc>https://c.fr/</loc></url><url><loc>https://c.fr/a?x=1&amp;y=2</loc></url></urlset>";
    expect(parseSitemap(xml).pages).toEqual(["https://c.fr/", "https://c.fr/a?x=1&y=2"]);
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://c.fr/s1.xml</loc></sitemap></sitemapindex>").sitemaps).toEqual(["https://c.fr/s1.xml"]);
    const pages = await resolvePages({ nom: "c", pages: ["https://c.fr/", "https://c.fr/", "https://c.fr/doc.pdf", "https://c.fr/b"], exclure: ["\\.pdf$"], max: 1 });
    expect(pages).toEqual(["https://c.fr/"]);
  });
});
