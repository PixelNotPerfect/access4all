import type { Status } from "@access4all/core";

export interface AuditPage {
  id: string;
  name: string;
  url: string;
}

export interface Audit {
  version: 1;
  name: string;
  pages: AuditPage[];
  /** results[pageId][criterionId] = statut */
  results: Record<string, Record<string, Status>>;
  /** notes[criterionId] = remarque libre (consolidée sur l'échantillon) */
  notes: Record<string, string>;
  wcag22: boolean;
  plan: { startDate: string; sprintDays: number; capacity: number };
}

export type DesignStatus = "ok" | "ko" | "na";
export interface DesignReview {
  version: 1;
  name: string;
  status: Record<string, DesignStatus>;
  notes: Record<string, string>;
}

const AUDIT_KEY = "access4all.audit";
const DESIGN_KEY = "access4all.design";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyAudit(): Audit {
  return {
    version: 1,
    name: "Mon site",
    pages: [{ id: newId(), name: "Accueil", url: "" }],
    results: {},
    notes: {},
    wcag22: true,
    plan: { startDate: today(), sprintDays: 14, capacity: 8 },
  };
}

export function emptyDesign(): DesignReview {
  return { version: 1, name: "Mes maquettes", status: {}, notes: {} };
}

function read<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback(), ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible ou corrompu : on repart d'un état vierge */
  }
  return fallback();
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : l'état reste en mémoire */
  }
}

export const store = {
  audit: read(AUDIT_KEY, emptyAudit),
  design: read(DESIGN_KEY, emptyDesign),
  saveAudit() {
    write(AUDIT_KEY, this.audit);
  },
  saveDesign() {
    write(DESIGN_KEY, this.design);
  },
};

/** Valide et normalise un audit importé depuis un fichier JSON. */
export function parseAudit(json: string): Audit {
  const data = JSON.parse(json);
  if (!data || data.version !== 1 || !Array.isArray(data.pages) || typeof data.results !== "object") {
    throw new Error("Ce fichier n'est pas un audit access4all.");
  }
  return { ...emptyAudit(), ...data };
}

/** Résultat JSON produit par « access4all check --format json ». */
interface CliReport {
  pages: Array<{ url: string; failures: Array<{ criterion: string }> }>;
}

/**
 * Intègre un rapport de la CLI : crée les pages absentes (par URL) et marque
 * « non conforme » les critères en échec. Ne touche pas aux statuts déjà saisis
 * à la main, sauf s'ils étaient « non testé ».
 */
export function importCliReport(audit: Audit, json: string): { pages: number; marked: number } {
  const data = JSON.parse(json) as CliReport;
  if (!data || !Array.isArray(data.pages)) throw new Error("Ce fichier n'est pas un rapport JSON de « access4all check ».");
  let marked = 0;
  for (const p of data.pages) {
    let page = audit.pages.find((x) => x.url === p.url);
    if (!page) {
      const blank = audit.pages.find((x) => !x.url && !Object.keys(audit.results[x.id] ?? {}).length);
      page = blank ?? { id: newId(), name: "", url: "" };
      page.url = p.url;
      page.name ||= nameFromUrl(p.url);
      if (!blank) audit.pages.push(page);
    }
    const res = (audit.results[page.id] ??= {});
    for (const f of p.failures) {
      if (!res[f.criterion] || res[f.criterion] === "NT") {
        res[f.criterion] = "NC";
        marked++;
      }
    }
  }
  return { pages: data.pages.length, marked };
}

function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/\.html?$/, "") : u.hostname || "Page";
  } catch {
    return url;
  }
}
