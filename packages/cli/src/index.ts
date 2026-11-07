#!/usr/bin/env node
import { parseArgs } from "node:util";
import { realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import type { Impact, Persona } from "@access4all/core";
import { analyze, exceedsThreshold, manualChecklist, settledCriteria } from "./analyze.js";
import { renderCheck, renderChecklist, type Format } from "./render.js";
import { renderHtmlReport } from "./render-html.js";
import { scanUrls } from "./scan.js";
import { REPORTS_DIR, initProduct, loadProduct, productDir, resolvePages, stamp } from "./product.js";

export { analyze, manualChecklist, exceedsThreshold, settledCriteria } from "./analyze.js";
export { runChecks, crossPageChecks } from "./checks.js";
export { renderCheck, renderChecklist } from "./render.js";
export { renderHtmlReport } from "./render-html.js";
export { ruleFixes, closestCompliantColor, contrastRatio } from "./fixes.js";
export { scanUrls } from "./scan.js";
export { groupDevtools, guideFor } from "./devtools-guide.js";
export { REPORTS_DIR, loadProduct, resolvePages, parseSitemap, initProduct } from "./product.js";

const HELP = `access4all — accessibilité RGAA 4.1.2 + WCAG 2.2

Usage :
  access4all check <url|fichier.html>... [options]
      Scanne les pages avec axe-core et donne, étape par étape, ce qu'il faut corriger avant la recette.

  access4all check --produit <id> [options]
      Scanne tous les écrans d'un produit (liste et/ou sitemap de son produit.json) et produit
      un seul rapport : d'abord les problèmes communs à plusieurs écrans, puis le détail par écran.

  access4all produit <id> <url>... [--nom "Nom affiché"]
      Crée ~/access4all-rapports/<id>/produit.json (à compléter avec la liste des écrans).

  access4all checklist --role <dev|design|ba> [options]
      Affiche la checklist du métier (design : revue de maquettes ; ba : grille de recette).

Options communes :
  -f, --format <text|markdown|json|html>
                                      Format de sortie (défaut : text). html (check seulement) : rapport
                                      détaillé avec une capture de chaque élément à corriger
  -o, --output <fichier>              Écrire le résultat dans un fichier
      --no-wcag22                     Se limiter au RGAA 4.1.2 (sans les compléments WCAG 2.2)

Options de « check » :
      --fail-on <bloquant|majeur|mineur|aucun>
                                      Code de sortie 1 si un critère de cette gravité (ou pire) échoue (défaut : bloquant)
      --manual <essentiel|tout|aucun> Vérifications manuelles à lister (défaut : essentiel = bloquants et majeurs)
      --wait <ms>                     Attendre après le chargement (applications JavaScript)
      --viewport <LxH>                Taille de fenêtre, ex. 320x640 pour tester le reflow (défaut : 1280x800)
      --no-screenshots                Rapport HTML sans captures d'écran
      --rapide                        Sans les tests complémentaires (clavier, zoom, reflow, espacement…) :
                                      plus rapide, mais davantage de vérifications manuelles
      --produit <id>                  Scanner les écrans du produit <id> (voir « produit »)
      --no-open                       Ne pas ouvrir le rapport HTML dans le navigateur (automatique en CI)

Rapport HTML : sans -o, il est rangé hors de votre code puis ouvert dans le navigateur :
~/access4all-rapports/<id-produit ou domaine>/<date>_<heure>.html
      --chromium <chemin>             Exécutable Chromium à utiliser (ou variable ACCESS4ALL_CHROMIUM)

Exemples :
  access4all check http://localhost:3000 http://localhost:3000/contact
  access4all check build/index.html --format markdown -o rapport-a11y.md
  access4all check https://exemple.fr --format html
  access4all checklist --role design --format markdown -o revue-maquettes.md
`;

const FORMATS: Array<Format | "html"> = ["text", "markdown", "json", "html"];
/** Chemin par défaut d'un rapport : ~/access4all-rapports/<domaine>/<date>_<heure>.html */
export function defaultReportPath(firstUrl: string, now = new Date()): string {
  let site = "fichiers-locaux";
  try {
    const u = new URL(firstUrl);
    if (u.hostname) site = u.hostname.replace(/^www\./, "");
  } catch {
    // URL invalide : dossier générique.
  }
  site = site.replace(/[^a-z0-9.-]+/gi, "_");
  return join(REPORTS_DIR, site, `${stamp(now)}.html`);
}

/** Ouvre un fichier avec l'application par défaut (le navigateur pour un .html). */
function openInBrowser(path: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [path]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", path]] : ["xdg-open", [path]];
  const fallback = () => process.stderr.write(`Ouvrez le rapport dans votre navigateur : ${path}\n`);
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", fallback);
    child.unref();
  } catch {
    fallback();
  }
}
const THRESHOLDS = ["bloquant", "majeur", "mineur", "aucun"] as const;

function fail(msg: string): never {
  process.stderr.write(`Erreur : ${msg}\n\n${HELP}`);
  process.exit(2);
}

function toUrl(arg: string): string {
  if (/^https?:\/\//i.test(arg) || arg.startsWith("file:")) return arg;
  return pathToFileURL(resolve(arg)).href;
}

function emit(content: string, output?: string) {
  if (output) {
    writeFileSync(output, content);
    process.stderr.write(`Résultat écrit dans ${output}\n`);
  } else {
    process.stdout.write(content);
  }
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: "string", short: "f", default: "text" },
      output: { type: "string", short: "o" },
      "no-wcag22": { type: "boolean", default: false },
      "fail-on": { type: "string", default: "bloquant" },
      manual: { type: "string", default: "essentiel" },
      wait: { type: "string" },
      viewport: { type: "string" },
      chromium: { type: "string" },
      "no-screenshots": { type: "boolean", default: false },
      "no-open": { type: "boolean", default: false },
      rapide: { type: "boolean", default: false },
      role: { type: "string" },
      produit: { type: "string" },
      nom: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(HELP);
    return 0;
  }
  const format = values.format as Format | "html";
  if (!FORMATS.includes(format)) fail(`format inconnu « ${values.format} »`);
  const wcag22 = !values["no-wcag22"];

  if (command === "checklist") {
    const role = values.role as Persona | undefined;
    if (!role || !["dev", "design", "ba"].includes(role)) fail("--role doit valoir dev, design ou ba");
    if (format === "html") fail("le format html n'est disponible que pour « check »");
    emit(renderChecklist(manualChecklist(role, { wcag22 }), role, format), values.output);
    return 0;
  }

  if (command === "produit") {
    const [id, ...urls] = rest;
    if (!id || urls.length === 0) fail("indiquez l'identifiant du produit et au moins une URL, ex. access4all produit client1 https://client1.fr");
    const file = initProduct(id, urls.map(toUrl), values.nom);
    process.stderr.write(`Produit créé : ${file}\nAjoutez-y la liste des écrans (« pages ») ou vérifiez le « sitemap », puis lancez :\n  access4all check --produit ${id} --format html\n`);
    return 0;
  }

  if (command === "check") {
    let productName: string | undefined;
    let targets = rest.map(toUrl);
    if (values.produit) {
      const product = loadProduct(values.produit);
      productName = product.nom;
      targets = [...new Set([...(await resolvePages(product, (m) => process.stderr.write(`${m}\n`))), ...targets])];
      process.stderr.write(`${product.nom} : ${targets.length} écran(s) à scanner.\n`);
    }
    if (targets.length === 0) fail("indiquez au moins une URL, un fichier HTML ou --produit");
    const failOn = values["fail-on"] as (typeof THRESHOLDS)[number];
    if (!THRESHOLDS.includes(failOn)) fail(`--fail-on inconnu « ${failOn} »`);
    if (!["essentiel", "tout", "aucun"].includes(values.manual!)) fail(`--manual inconnu « ${values.manual} »`);
    let viewport: { width: number; height: number } | undefined;
    if (values.viewport) {
      const m = /^(\d+)x(\d+)$/.exec(values.viewport);
      if (!m) fail("--viewport attend la forme LARGEURxHAUTEUR, ex. 320x640");
      viewport = { width: Number(m[1]), height: Number(m[2]) };
    }

    const results = await scanUrls(targets, {
      onPage: targets.length > 1 ? (i, url) => process.stderr.write(`[${i + 1}/${targets.length}] ${url}\n`) : undefined,
      executablePath: values.chromium,
      viewport,
      waitMs: values.wait ? Number(values.wait) : undefined,
      screenshots: format === "html" && !values["no-screenshots"],
      checks: !values.rapide,
    });
    const analyses = results.map((r) => analyze(r, { wcag22 }));
    const failed = new Set(analyses.flatMap((a) => a.failures.map((f) => f.criterion.id)));
    const settled = settledCriteria(analyses);
    const manual =
      values.manual === "aucun"
        ? []
        : manualChecklist("dev", { wcag22, exclude: [...failed, ...settled.map((s) => s.criterion.id)] }).filter(
            (c) => values.manual === "tout" || c.impact !== "mineur",
          );
    if (format === "html") {
      const path = values.output
        ? resolve(values.output)
        : values.produit
          ? join(productDir(values.produit), `${stamp()}.html`)
          : defaultReportPath(results[0]?.url ?? targets[0]);
      mkdirSync(resolve(path, ".."), { recursive: true });
      emit(renderHtmlReport({ analyses, manual, settled }, { productName }), path);
      if (!values["no-open"] && !process.env.CI) openInBrowser(path);
    } else {
      emit(renderCheck({ analyses, manual, settled }, format), values.output);
    }
    return exceedsThreshold(analyses, failOn as Impact | "aucun") ? 1 : 0;
  }

  fail(`commande inconnue « ${command} »`);
}

const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`Erreur : ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(2);
    },
  );
}
