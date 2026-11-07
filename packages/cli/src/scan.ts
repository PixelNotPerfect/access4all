import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { mappedAxeRules } from "@access4all/core";
import type { AxeResults, AxeRuleResult } from "./analyze.js";
import { crossPageChecks, runChecks, type ChecksResult } from "./checks.js";
import { collectDevtools } from "./devtools.js";

const require = createRequire(import.meta.url);

export interface ScanOptions {
  /** Chemin d'un exécutable Chromium (sinon celui de Playwright). */
  executablePath?: string;
  /** Largeur × hauteur de la fenêtre. Défaut : 1280 × 800. */
  viewport?: { width: number; height: number };
  /** Attente supplémentaire après chargement, en ms (contenus chargés en JS). */
  waitMs?: number;
  timeoutMs?: number;
  /** Capturer chaque élément en erreur (pour le rapport HTML). */
  screenshots?: boolean;
  /** Nombre maximal de captures par page. Défaut : 60. */
  maxScreenshots?: number;
  /**
   * Tests complémentaires (clavier, zoom, reflow, espacement, DOM et CSS) qui
   * couvrent des critères hors de portée d'axe-core. Défaut : true.
   */
  checks?: boolean;
  /** Appelé avant le scan de chaque page (progression). */
  onPage?: (index: number, url: string) => void;
}

/** Marge autour de l'élément capturé, en px. */
const PAD = 48;
const MIN_W = 640;
const MIN_H = 240;
const MAX_W = 1000;
const MAX_H = 520;

/** Capture chaque élément en violation, encadré, avec un peu de contexte autour. */
async function captureNodes(page: import("playwright").Page, rules: AxeRuleResult[], max: number, seen: Set<string>): Promise<void> {
  let count = 0;
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  for (const rule of rules) {
    for (const node of rule.nodes) {
      // Sélecteurs dans un iframe ou un shadow DOM : non gérés ici.
      if (node.target.length !== 1 || typeof node.target[0] !== "string") continue;
      const selector = node.target[0];
      if (/^html$/i.test(selector)) {
        node.visibility = "page";
        continue;
      }
      if (count >= max || node.screenshot) continue;
      // Élément déjà capturé sur une page précédente (en-tête, pied de page…) : une capture suffit.
      const key = `${rule.id}|${node.html}`;
      if (seen.has(key)) continue;
      const box = await page
        .evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          el.scrollIntoView({ block: "center", inline: "center" });
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          const hidden = r.width < 1 || r.height < 1 || st.visibility === "hidden" || st.display === "none";
          return { x: r.left, y: r.top, width: r.width, height: r.height, hidden };
        }, selector)
        .catch(() => null);
      if (!box) continue;
      if (box.hidden) {
        node.visibility = "hidden";
        continue;
      }
      const marker = await page.evaluateHandle((b) => {
        const m = document.createElement("div");
        m.setAttribute("data-access4all-marker", "");
        m.style.cssText = `position:fixed;left:${b.x - 4}px;top:${b.y - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;` +
          "outline:3px solid #d0006f;box-shadow:0 0 0 6px rgba(255,255,255,.85);pointer-events:none;z-index:2147483647;border-radius:3px;";
        document.body.appendChild(m);
        return m;
      }, box);
      try {
        // Zone de contexte centrée sur l'élément, assez large pour se repérer dans la page.
        const width = Math.min(vp.width, MAX_W, Math.max(MIN_W, box.width + 2 * PAD));
        const height = Math.min(vp.height, MAX_H, Math.max(MIN_H, box.height + 2 * PAD));
        const x = Math.min(Math.max(0, box.x + box.width / 2 - width / 2), vp.width - width);
        const y = Math.min(Math.max(0, box.y + box.height / 2 - height / 2), vp.height - height);
        if (width < 1 || height < 1) continue;
        const buf = await page.screenshot({ clip: { x, y, width, height }, type: "jpeg", quality: 75, animations: "disabled" });
        node.screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`;
        node.visibility = "visible";
        seen.add(key);
        count++;
      } catch {
        // Capture impossible (élément hors écran, page instable) : le rapport s'en passe.
      } finally {
        await marker.evaluate((m) => (m as Element).remove()).catch(() => {});
      }
    }
  }
}

function axeSource(): string {
  return readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
}

function axeLocaleFr(): unknown {
  const p = require.resolve("axe-core/locales/fr.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
}

/** Ouvre chaque URL dans Chromium et exécute axe-core avec les règles reliées au RGAA. */
export async function scanUrls(urls: string[], options: ScanOptions = {}): Promise<AxeResults[]> {
  const { chromium } = await import("playwright");
  const executablePath = options.executablePath ?? process.env.ACCESS4ALL_CHROMIUM ?? undefined;
  // Chromium complet plutôt que la version « headless shell » : seul le premier remplit
  // l'onglet Problèmes (Issues) des DevTools (formulaires mal étiquetés, id en double…).
  const browser = executablePath
    ? await chromium.launch({ executablePath })
    : await chromium.launch({ channel: "chromium" }).catch(() => chromium.launch());
  const source = axeSource();
  const locale = axeLocaleFr();
  const rules = mappedAxeRules();
  const out: AxeResults[] = [];
  const seen = new Set<string>();
  try {
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 1280, height: 800 },
      locale: "fr-FR",
      // Injection d'axe-core et des styles de test, même si la page a une politique CSP stricte.
      bypassCSP: true,
    });
    const checks: Array<ChecksResult | undefined> = [];
    for (const [i, url] of urls.entries()) {
      options.onPage?.(i, url);
      const page = await context.newPage();
      // Erreurs visibles dans les DevTools (console, réseau, onglet Problèmes), dès le chargement.
      const devtools = await collectDevtools(page, context);
      try {
        try {
          await page.goto(url, { waitUntil: "load", timeout: options.timeoutMs ?? 30_000 });
        } catch (e) {
          // Sur un produit de plusieurs écrans, une page en erreur ne doit pas arrêter tout le scan.
          if (urls.length === 1) throw e;
          out.push({ url, violations: [], incomplete: [], passes: [], error: (e as Error).message.split("\n")[0], devtools: await devtools.finish() });
          continue;
        }
        if (options.waitMs) await page.waitForTimeout(options.waitMs);
        // axe-core relit les feuilles de styles : ses propres messages ne sont pas des erreurs du site.
        devtools.pause();
        await page.addScriptTag({ content: source });
        const res = await page.evaluate(
          async ({ rules, locale }) => {
            const axe = (window as any).axe;
            if (locale) axe.configure({ locale });
            const r = await axe.run(document, {
              runOnly: { type: "rule", values: rules },
              resultTypes: ["violations", "incomplete"],
            });
            const slim = (list: any[]) =>
              list.map((x) => ({
                id: x.id,
                impact: x.impact,
                help: x.help,
                helpUrl: x.helpUrl,
                nodes: x.nodes.map((n: any) => {
                  // Données techniques utiles à la correction (ex. couleurs et ratio de contraste).
                  const check = [...(n.any ?? []), ...(n.all ?? []), ...(n.none ?? [])].find((c: any) => c.data && typeof c.data === "object");
                  return { target: n.target, html: n.html, failureSummary: n.failureSummary, ...(check ? { data: check.data } : {}) };
                }),
              }));
            return { violations: slim(r.violations), incomplete: slim(r.incomplete), passes: slim(r.passes).map((p: any) => ({ ...p, nodes: [] })) };
          },
          { rules, locale },
        );
        devtools.resume();
        if (options.screenshots) await captureNodes(page, res.violations, options.maxScreenshots ?? 60, seen);
        const title = await page.title();
        const finalUrl = page.url();
        let extra: ChecksResult | undefined;
        if (options.checks !== false) {
          extra = await runChecks(page, {
            capture: options.screenshots ? (rules) => captureNodes(page, rules, options.maxScreenshots ?? 60, seen) : undefined,
          });
          // Taille des cibles : axe-core la mesure entièrement ; un succès sans réserve vaut conformité.
          const t = (list: AxeRuleResult[]) => list.some((r) => r.id === "target-size");
          if (t(res.passes) && !t(res.violations) && !t(res.incomplete)) {
            extra.verdicts.push({ criterion: "WCAG-2.5.8", status: "C", reason: "Toutes les cibles cliquables mesurées par axe-core font au moins 24 × 24 px ou sont assez espacées." });
          }
        }
        checks[out.length] = extra;
        out.push({ url: finalUrl, title, ...res, devtools: await devtools.finish() });
      } finally {
        await page.close();
      }
    }
    // Comparaisons entre écrans (titres identiques, menu à la même place), puis fusion.
    crossPageChecks(out.map((r, i) => ({ url: r.url, facts: checks[i]?.facts, checks: checks[i] })));
    out.forEach((r, i) => {
      const c = checks[i];
      if (!c) return;
      r.violations.push(...c.violations);
      r.incomplete.push(...c.incomplete);
      r.verdicts = c.verdicts;
    });
  } finally {
    await browser.close();
  }
  return out;
}
