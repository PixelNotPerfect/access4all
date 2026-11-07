import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { analyze, scanUrls } from "@access4all/cli";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
let server: Server;
let base = "";
let browser: Browser;

beforeAll(async () => {
  if (!existsSync(join(dist, "index.html"))) throw new Error("Lancez « npm run build » avant les tests de bout en bout.");
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    const file = join(dist, path.endsWith("/") ? `${path}index.html` : path);
    try {
      // Lire avant d'écrire l'en-tête : un fichier absent (ex. /favicon.ico, demandé par Chromium) doit donner un 404.
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
  browser = await chromium.launch({ executablePath: process.env.ACCESS4ALL_CHROMIUM });
});

afterAll(async () => {
  await browser?.close();
  await new Promise((r) => server?.close(r));
});

describe("l'app est elle-même accessible", () => {
  it("aucune erreur axe sur les quatre écrans", async () => {
    const urls = ["#/", "#/maquettes", "#/grille", "#/rapport"].map((h) => base + h);
    for (const res of await scanUrls(urls)) {
      const a = analyze(res);
      expect(a.failures.map((f) => `${f.criterion.id} ${f.violations.map((v) => v.selector).join(", ")}`), res.url).toEqual([]);
    }
  }, 120_000);

  it("s'affiche sans défilement horizontal à 320 px (critère 10.11)", async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
    for (const h of ["#/", "#/maquettes", "#/grille", "#/rapport"]) {
      await page.goto(base + h);
      // Police large pour ne pas dépendre des polices installées sur la machine.
      await page.addStyleTag({ content: ":root { font-family: 'DejaVu Sans', Verdana, sans-serif !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), h).toBeLessThanOrEqual(320);
    }
    await page.close();
  });
});

describe("parcours audit → rapport → calendrier", () => {
  it("met à jour le taux et le calendrier à partir de la grille", async () => {
    const page = await browser.newPage();
    await page.goto(`${base}#/grille`);
    await page.getByRole("group", { name: /^1\.1 / }).getByLabel("Non conforme").check();
    await page.getByRole("group", { name: /^3\.2 / }).getByLabel("Conforme", { exact: true }).check();
    await expect.poll(() => page.locator("#grid-summary").textContent()).toContain("Taux global de l'échantillon : 50 %");

    await page.getByRole("link", { name: "Rapport et calendrier" }).click();
    await expect.poll(() => page.locator("h1").textContent()).toContain("Rapport d'audit");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H1");
    const kpis = await page.locator(".kpis").textContent();
    expect(kpis).toContain("50 %");
    expect(kpis).toContain("partiellement conforme");
    expect(await page.locator("#plan").textContent()).toContain("1.1 — Chaque image porteuse");

    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /agenda/ }).click()]);
    expect(dl.suggestedFilename()).toBe("plan-accessibilite-mon-site.ics");
    await page.close();
  }, 60_000);

  it("vérifie un contraste dans la revue de maquettes", async () => {
    const page = await browser.newPage();
    await page.goto(`${base}#/maquettes`);
    await page.getByLabel("Couleur du texte ou de l'élément").fill("#000000");
    await expect.poll(() => page.locator("#contrast-result").textContent()).toContain("21:1");
    await page.close();
  });
});
