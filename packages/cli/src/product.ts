/**
 * Produits : un fichier produit.json par client/produit, rangé hors du code dans
 * ~/access4all-rapports/<identifiant>/, qui liste les écrans à scanner ensemble.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Dossier des rapports et des fichiers produit, hors de tout dépôt de code. */
export const REPORTS_DIR = process.env.ACCESS4ALL_RAPPORTS ?? join(homedir(), "access4all-rapports");

export const PRODUCT_FILE = "produit.json";

export interface Product {
  /** Nom affiché dans le rapport. */
  nom: string;
  /** URL des écrans à scanner. */
  pages?: string[];
  /** URL d'un sitemap.xml (ou index de sitemaps) : ses pages s'ajoutent à la liste. */
  sitemap?: string;
  /** Expressions régulières : les URL qui correspondent sont ignorées. */
  exclure?: string[];
  /** Nombre maximal de pages scannées (défaut : 200). */
  max?: number;
}

export function productDir(id: string): string {
  if (!/^[\w.-]+$/.test(id)) throw new Error(`identifiant de produit invalide « ${id} » (lettres, chiffres, point, tiret, souligné)`);
  return join(REPORTS_DIR, id);
}

export function productFile(id: string): string {
  return join(productDir(id), PRODUCT_FILE);
}

export function loadProduct(id: string): Product {
  const file = productFile(id);
  if (!existsSync(file)) {
    throw new Error(`le produit « ${id} » n'existe pas (${file} introuvable).\nCréez-le avec : access4all produit ${id} <url-du-site>`);
  }
  let p: Product;
  try {
    p = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} n'est pas un JSON valide : ${(e as Error).message}`);
  }
  if (!p.pages?.length && !p.sitemap) throw new Error(`${file} doit contenir « pages » (liste d'URL) ou « sitemap »`);
  return { ...p, nom: p.nom || id };
}

/** Crée le fichier produit.json d'un produit à partir de l'URL du site. */
export function initProduct(id: string, urls: string[], nom?: string): string {
  const file = productFile(id);
  if (existsSync(file)) throw new Error(`${file} existe déjà : modifiez-le directement`);
  const first = new URL(urls[0]);
  const product: Product = {
    nom: nom ?? id,
    pages: urls,
    ...(/^https?:$/.test(first.protocol) ? { sitemap: `${first.origin}/sitemap.xml` } : {}),
    exclure: ["\\.(pdf|jpg|jpeg|png|zip|docx?)$"],
    max: 200,
  };
  mkdirSync(productDir(id), { recursive: true });
  writeFileSync(file, JSON.stringify(product, null, 2) + "\n");
  return file;
}

/** Extrait les URL d'un sitemap XML. */
export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = (re: RegExp) => [...xml.matchAll(re)].map((m) => m[1].trim().replace(/&amp;/g, "&"));
  if (/<sitemapindex/i.test(xml)) return { pages: [], sitemaps: locs(/<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>/gi) };
  return { pages: locs(/<url>[\s\S]*?<loc>([\s\S]*?)<\/loc>/gi), sitemaps: [] };
}

async function fetchSitemap(url: string, depth = 0): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sitemap ${url} : HTTP ${res.status}`);
  const { pages, sitemaps } = parseSitemap(await res.text());
  if (depth < 2) for (const s of sitemaps) pages.push(...(await fetchSitemap(s, depth + 1)));
  return pages;
}

/** Liste finale des écrans : pages + sitemap, sans doublons ni exclusions, limitée à max. */
export async function resolvePages(p: Product, warn: (msg: string) => void = () => {}): Promise<string[]> {
  const urls = [...(p.pages ?? [])];
  if (p.sitemap) {
    try {
      urls.push(...(await fetchSitemap(p.sitemap)));
    } catch (e) {
      warn(`Sitemap ignoré : ${(e as Error).message}`);
    }
  }
  const exclude = (p.exclure ?? []).map((r) => new RegExp(r, "i"));
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].filter((u) => !exclude.some((r) => r.test(u)));
  const max = p.max ?? 200;
  if (unique.length > max) warn(`${unique.length} pages trouvées : seules les ${max} premières sont scannées (réglage « max » de produit.json).`);
  return unique.slice(0, max);
}

/** Horodatage pour le nom de fichier : 2026-11-07_09h05 */
export function stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}h${p(now.getMinutes())}`;
}
