import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { mappedAxeRules } from "@access4all/core";
import type { AxeResults } from "./analyze.js";

const require = createRequire(import.meta.url);

export interface ScanOptions {
  /** Chemin d'un exécutable Chromium (sinon celui de Playwright). */
  executablePath?: string;
  /** Largeur × hauteur de la fenêtre. Défaut : 1280 × 800. */
  viewport?: { width: number; height: number };
  /** Attente supplémentaire après chargement, en ms (contenus chargés en JS). */
  waitMs?: number;
  timeoutMs?: number;
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
  const browser = await chromium.launch({ executablePath });
  const source = axeSource();
  const locale = axeLocaleFr();
  const rules = mappedAxeRules();
  const out: AxeResults[] = [];
  try {
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 1280, height: 800 },
      locale: "fr-FR",
    });
    for (const url of urls) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "load", timeout: options.timeoutMs ?? 30_000 });
        if (options.waitMs) await page.waitForTimeout(options.waitMs);
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
                nodes: x.nodes.map((n: any) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })),
              }));
            return { violations: slim(r.violations), incomplete: slim(r.incomplete), passes: slim(r.passes).map((p: any) => ({ ...p, nodes: [] })) };
          },
          { rules, locale },
        );
        out.push({ url: page.url(), ...res });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}
