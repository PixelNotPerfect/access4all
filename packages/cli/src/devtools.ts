import type { BrowserContext, CDPSession, Page } from "playwright";

/**
 * Erreurs et avertissements que l'on voit dans les outils de développement du
 * navigateur (DevTools) : console, erreurs JavaScript non interceptées, requêtes
 * réseau en échec et onglet « Problèmes » (Issues). axe-core ne les voit pas :
 * ils sont collectés pendant le scan, puis expliqués pas à pas dans le rapport.
 */

/** Onglet DevTools où l'on retrouve l'entrée. */
export type DevtoolsSource = "console" | "exception" | "network" | "issue";

export interface DevtoolsEntry {
  source: DevtoolsSource;
  level: "error" | "warning";
  /** Message tel qu'affiché par le navigateur. */
  message: string;
  /** Code de l'onglet Problèmes (ex. GenericIssue) ou type d'erreur JS (ex. TypeError). */
  code?: string;
  /** Ressource en échec (requêtes réseau). */
  resource?: string;
  /** Type de ressource : image, script, stylesheet, font, fetch… */
  resourceType?: string;
  /** Statut HTTP (requêtes réseau). */
  status?: number;
  /** Fichier:ligne:colonne d'où vient le message. */
  location?: string;
  /** Pile d'appels (erreurs JS), quelques lignes. */
  stack?: string;
  /** Élément HTML en cause (onglet Problèmes). */
  html?: string;
  /** Nombre de fois où le message est apparu sur l'écran. */
  count: number;
}

/** Problèmes déjà signalés autrement (console ou réseau) : inutile de les compter deux fois. */
const DUPLICATE_ISSUES = new Set([
  "MixedContentIssue",
  "ContentSecurityPolicyIssue",
  "CorsIssue",
  "StylesheetLoadingIssue",
  "BlockedByResponseIssue",
]);

/** Échecs réseau sans intérêt : requête annulée par la page elle-même (navigation, média…). */
const IGNORED_NET_ERRORS = /net::ERR_ABORTED/;

const MAX_ENTRIES = 200;
const MAX_TEXT = 600;

function clip(s: string, max = MAX_TEXT): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function loc(url?: string, line?: number, col?: number): string | undefined {
  if (!url) return undefined;
  return line || col ? `${url}:${(line ?? 0) + 1}:${(col ?? 0) + 1}` : url;
}

/** Texte lisible d'un problème de l'onglet « Problèmes » de Chrome. */
const FORM_ISSUES: Record<string, string> = {
  FormLabelForNameError: "Un attribut for de <label> désigne un name au lieu d'un id.",
  FormDuplicateIdForInputError: "Plusieurs champs de formulaire ont le même id.",
  FormInputWithNoLabelError: "Un champ de formulaire n'a pas d'étiquette associée.",
  FormAutocompleteAttributeEmptyError: "Un attribut autocomplete est vide.",
  FormEmptyIdAndNameAttributesForInputError: "Un champ de formulaire n'a ni id ni name.",
  FormAriaLabelledByToNonExistingId: "aria-labelledby pointe vers un id qui n'existe pas.",
  FormInputAssignedAutocompleteValueToIdOrNameAttributeError: "Une valeur d'autocomplete est utilisée comme id ou name au lieu de l'attribut autocomplete.",
  FormLabelHasNeitherForNorNestedInputError: "Un <label> n'a ni attribut for ni champ à l'intérieur : il n'étiquette aucun champ.",
  FormLabelForMatchesNonExistingIdError: "L'attribut for d'un <label> pointe vers un id qui n'existe pas.",
  FormInputHasWrongButWellIntendedAutocompleteValueError: "Une valeur d'autocomplete est mal orthographiée.",
  ResponseWasBlockedByORB: "Une réponse a été bloquée par le navigateur (ORB).",
};

function issueMessage(issue: any): { message: string; location?: string; nodeId?: number; level: "error" | "warning" } {
  const code: string = issue.code;
  const d = issue.details ?? {};
  const g = d.genericIssueDetails;
  if (g) {
    return {
      message: FORM_ISSUES[g.errorType] ?? `${g.errorType}${g.violatingNodeAttribute ? ` (attribut ${g.violatingNodeAttribute})` : ""}`,
      nodeId: g.violatingNodeId,
      level: /Error$/.test(g.errorType) && !/Autocomplete|EmptyIdAndName/.test(g.errorType) ? "error" : "warning",
    };
  }
  const dep = d.deprecationIssueDetails;
  if (dep) {
    const l = dep.sourceCodeLocation;
    return { message: `Fonctionnalité obsolète utilisée : ${dep.type}.`, location: loc(l?.url, l?.lineNumber, l?.columnNumber), level: "warning" };
  }
  const cookie = d.cookieIssueDetails;
  if (cookie) {
    const reasons = [...(cookie.cookieWarningReasons ?? []), ...(cookie.cookieExclusionReasons ?? [])].join(", ");
    const name = cookie.cookie?.name ?? cookie.rawCookieLine?.split("=")[0];
    return { message: `Cookie${name ? ` « ${name} »` : ""} : ${reasons || "problème de configuration"}.`, level: cookie.cookieExclusionReasons?.length ? "error" : "warning" };
  }
  const quirks = d.quirksModeIssueDetails;
  if (quirks) return { message: "La page s'affiche en mode de compatibilité (quirks mode) : le <!DOCTYPE html> manque ou est incorrect.", level: "warning" };
  const contrast = d.lowTextContrastIssueDetails;
  if (contrast) {
    return {
      message: `Contraste insuffisant : ${contrast.contrastRatio?.toFixed?.(2) ?? contrast.contrastRatio}:1 au lieu de ${contrast.thresholdAA}:1 minimum (${contrast.violatingNodeSelector ?? "texte"}).`,
      nodeId: contrast.violatingNodeId,
      level: "warning",
    };
  }
  const el = d.elementAccessibilityIssueDetails;
  if (el) return { message: `Structure d'élément non autorisée : ${el.elementAccessibilityIssueReason ?? code}.`, nodeId: el.nodeId, level: "warning" };
  return { message: `Problème signalé par Chrome : ${code}.`, level: "warning" };
}

export interface DevtoolsCollector {
  /**
   * Ignore ce qui se passe pendant que l'outil lui-même travaille dans la page
   * (axe-core relit par exemple les feuilles de styles) : ce n'est pas une erreur du site.
   */
  pause(): void;
  resume(): void;
  /** Attend la fin des traitements en cours et renvoie les entrées dédoublonnées. */
  finish(): Promise<DevtoolsEntry[]>;
}

/**
 * Écoute la page dès son ouverture (à appeler avant page.goto) pour ne rien manquer
 * de ce qui se passe au chargement.
 */
export async function collectDevtools(page: Page, context: BrowserContext): Promise<DevtoolsCollector> {
  const entries = new Map<string, DevtoolsEntry>();
  const pending: Promise<unknown>[] = [];
  /** URLs bloquées par CORS (le navigateur signale aussi l'échec réseau correspondant). */
  const corsBlocked = new Set<string>();
  let muted = 0;

  const add = (e: Omit<DevtoolsEntry, "count">) => {
    // Pendant le travail d'axe-core, seuls les problèmes de l'onglet Problèmes (propres à la page) comptent.
    if (muted && e.source !== "issue") return;
    const key = [e.source, e.message, e.resource ?? "", e.location ?? "", e.html ?? ""].join("|");
    const prev = entries.get(key);
    // Chrome renvoie parfois deux fois le même problème de l'onglet Problèmes : on ne compte qu'une fois.
    if (prev) prev.count += e.source === "issue" ? 0 : 1;
    else if (entries.size < MAX_ENTRIES) entries.set(key, { ...e, message: clip(e.message), count: 1 });
  };

  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    // Les ressources en échec sont suivies (avec plus de détails) par les écouteurs réseau.
    if (/^Failed to load resource/i.test(text)) return;
    const notable = /^\[DOM\]|aria-hidden|non-unique id|autocomplete attribute/i.test(text);
    if (type !== "error" && type !== "warning" && type !== "assert" && !notable) return;
    const m = /Access to .*? at '([^']+)' from origin .* blocked by CORS policy/.exec(text);
    if (m && !muted) corsBlocked.add(m[1]);
    const l = msg.location();
    add({ source: "console", level: type === "warning" || (notable && type !== "error") ? "warning" : "error", message: text, location: loc(l.url, l.lineNumber, l.columnNumber) });
  });

  page.on("pageerror", (err) => {
    const stack = (err.stack ?? "").split("\n").slice(1, 5).map((s) => s.trim()).filter(Boolean);
    const first = /\(?((?:https?|file):\/\/[^\s)]+?:\d+:\d+)\)?$/.exec(stack[0] ?? "")?.[1];
    add({
      source: "exception",
      level: "error",
      code: err.name || "Error",
      message: `${err.name && !err.message.startsWith(err.name) ? `${err.name}: ` : ""}${err.message}`,
      location: first,
      ...(stack.length ? { stack: stack.join("\n") } : {}),
    });
  });

  page.on("requestfailed", (req) => {
    const errorText = req.failure()?.errorText ?? "échec";
    if (IGNORED_NET_ERRORS.test(errorText) || req.url().startsWith("data:")) return;
    add({ source: "network", level: "error", message: errorText, resource: req.url(), resourceType: req.resourceType() });
  });

  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const req = res.request();
    add({
      source: "network",
      level: "error",
      status,
      message: `HTTP ${status}${res.statusText() ? ` ${res.statusText()}` : ""}`,
      resource: res.url(),
      resourceType: req.resourceType(),
    });
  });

  // Onglet « Problèmes » (Issues) : uniquement disponible avec Chromium, via le protocole DevTools.
  let cdp: CDPSession | undefined;
  try {
    cdp = await context.newCDPSession(page);
    cdp.on("Audits.issueAdded", ({ issue }: any) => {
      if (DUPLICATE_ISSUES.has(issue.code)) return;
      const { message, location, nodeId, level } = issueMessage(issue);
      const base = { source: "issue" as const, level, code: issue.code, message, ...(location ? { location } : {}) };
      if (!nodeId || !cdp) return add(base);
      pending.push(
        cdp
          .send("DOM.getOuterHTML", { backendNodeId: nodeId })
          .then((r: any) => add({ ...base, html: clip(r.outerHTML, 300) }))
          .catch(() => add(base)),
      );
    });
    await cdp.send("Audits.enable");
  } catch {
    // Navigateur sans protocole DevTools : console et réseau suffisent.
  }

  return {
    pause() {
      muted++;
    },
    resume() {
      muted = Math.max(0, muted - 1);
    },
    async finish() {
      await Promise.allSettled(pending);
      await cdp?.detach().catch(() => {});
      return [...entries.values()].filter(
        // L'échec réseau d'une requête bloquée par CORS est déjà expliqué par le message CORS.
        (e) => !(e.source === "network" && !e.status && e.resource && corsBlocked.has(e.resource)),
      );
    },
  };
}
