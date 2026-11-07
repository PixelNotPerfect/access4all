/**
 * Tests complémentaires d'access4all, exécutés dans Chromium après axe-core.
 *
 * axe-core n'analyse qu'un instantané du DOM. Ici, on manipule la page comme le
 * ferait un auditeur : on tabule dans toute la page, on passe à 320 px de large,
 * on zoome à 200 %, on force l'espacement du texte, on tourne l'écran, on lit les
 * feuilles de styles. On en tire, pour des critères qu'axe ne couvre pas :
 *  - des non-conformités avérées (violations) ;
 *  - des éléments précis à confirmer à la main (à vérifier) ;
 *  - des verdicts « conforme » ou « non applicable » qui retirent le critère
 *    des vérifications manuelles, avec la raison affichée dans le rapport.
 */
import type { Page } from "playwright";
import { criteriaForAxeRule } from "@access4all/core";
import type { AxeNode, AxeRuleResult } from "./analyze.js";

export type VerdictStatus = "C" | "NA";
export interface Verdict {
  criterion: string;
  status: VerdictStatus;
  /** Comment le verdict a été obtenu, en une phrase. */
  reason: string;
}

/** Repères d'un écran utilisés pour les comparaisons entre écrans d'un produit. */
export interface PageFacts {
  title: string;
  h1: string;
  /** Position de la navigation principale (en px, fenêtre 1280 de large). */
  nav?: { top: number; left: number; width: number; height: number; order: number };
}

export interface ChecksResult {
  violations: AxeRuleResult[];
  incomplete: AxeRuleResult[];
  verdicts: Verdict[];
  facts?: PageFacts;
}

export interface ChecksOptions {
  /** Capture des éléments (fournie par scan.ts). */
  capture?: (rules: AxeRuleResult[]) => Promise<void>;
  /** Nombre maximal de tabulations. Défaut : 150. */
  maxTabs?: number;
}

/** Libellé court de chaque test, repris dans le rapport quand il n'a pas d'explication dédiée. */
export const CHECK_HELP: Record<string, string> = {
  "a4a-alt-suspect": "Alternative textuelle probablement non pertinente",
  "a4a-svg-sans-statut": "Image SVG ni masquée ni nommée",
  "a4a-clic-non-focusable": "Élément cliquable inaccessible au clavier",
  "a4a-changement-contexte-focus": "Changement de page déclenché par la simple prise de focus",
  "a4a-select-onchange": "Liste déroulante qui agit dès le changement de valeur",
  "a4a-statut-absent": "Aucune zone de message de statut",
  "a4a-id-duplique": "Identifiant (id) utilisé plusieurs fois",
  "a4a-titre-page-generique": "Titre de page générique",
  "a4a-titre-page-duplique": "Même titre de page sur plusieurs écrans",
  "a4a-balise-presentation": "Balise utilisée pour la mise en page",
  "a4a-faux-titre": "Texte mis en forme comme un titre sans balise de titre",
  "a4a-zones-manquantes": "Zones de la page non identifiées",
  "a4a-attribut-presentation": "Balise ou attribut HTML de présentation",
  "a4a-contenu-css": "Information donnée uniquement par les styles CSS",
  "a4a-ordre-css": "Ordre visuel modifié par CSS",
  "a4a-zoom-texte-coupe": "Texte coupé avec un zoom à 200 %",
  "a4a-couleurs-css": "Couleur du texte déclarée sans couleur de fond",
  "a4a-focus-invisible": "Prise de focus invisible",
  "a4a-focus-element-cache": "Le focus arrive sur un élément invisible",
  "a4a-forme-position": "Information donnée par la forme, la taille ou la position",
  "a4a-reflow": "Contenu coupé ou défilement horizontal à 320 px de large",
  "a4a-espacement-texte": "Texte coupé quand l'espacement est augmenté",
  "a4a-infobulle-non-masquable": "Infobulle impossible à masquer avec Échap",
  "a4a-survol-seul": "Contenu affiché au survol de la souris uniquement",
  "a4a-groupe-sans-fieldset": "Boutons radio ou cases à cocher non regroupés",
  "a4a-groupe-sans-legende": "Regroupement de champs sans légende",
  "a4a-bouton-generique": "Intitulé de bouton peu explicite",
  "a4a-bouton-nom-visible": "Le nom accessible du bouton ne reprend pas son texte visible",
  "a4a-champ-obligatoire": "Champ obligatoire non signalé dans son étiquette",
  "a4a-autocomplete-manquant": "Champ d'information personnelle sans autocomplete",
  "a4a-navigation-inconstante": "Menu de navigation à une place différente selon l'écran",
  "a4a-lien-evitement": "Pas de lien d'évitement vers le contenu",
  "a4a-ordre-tabulation": "Ordre de tabulation à contre-sens de la lecture",
  "a4a-piege-clavier": "Piège au clavier",
  "a4a-animation": "Contenu en mouvement ou clignotant",
  "a4a-orientation": "Contenu perdu selon l'orientation de l'écran",
  "a4a-glisser": "Fonction utilisable par glisser ou geste",
  "a4a-focus-masque": "Élément qui reçoit le focus entièrement masqué",
};

const IMPACT: Record<string, string> = {
  "a4a-focus-invisible": "serious",
  "a4a-focus-element-cache": "serious",
  "a4a-piege-clavier": "critical",
  "a4a-clic-non-focusable": "critical",
  "a4a-focus-masque": "serious",
  "a4a-reflow": "serious",
};

interface RawItem {
  rule: string;
  kind: "violation" | "review";
  sel: string;
  html: string;
  note?: string;
  data?: Record<string, unknown>;
}
interface RawResult {
  items: RawItem[];
  verdicts: Verdict[];
}

/** Accumule violations, éléments à vérifier et verdicts. */
class Collector {
  readonly violations = new Map<string, AxeRuleResult>();
  readonly incomplete = new Map<string, AxeRuleResult>();
  readonly verdicts = new Map<string, Verdict>();

  add(item: RawItem, extra: Partial<AxeNode> = {}): AxeNode {
    const map = item.kind === "violation" ? this.violations : this.incomplete;
    const rule = map.get(item.rule) ?? { id: item.rule, impact: IMPACT[item.rule] ?? "moderate", help: CHECK_HELP[item.rule] ?? item.rule, helpUrl: "", nodes: [] };
    const node: AxeNode = {
      target: [item.sel],
      html: item.html,
      ...(item.note ? { failureSummary: item.note } : {}),
      ...(item.data ? { data: item.data } : {}),
      ...extra,
    };
    if (!rule.nodes.some((n) => n.target[0] === node.target[0] && n.html === node.html)) rule.nodes.push(node);
    map.set(item.rule, rule);
    return node;
  }

  addAll(r: RawResult) {
    for (const i of r.items) this.add(i);
    for (const v of r.verdicts) this.verdict(v);
  }

  /** Le premier verdict d'un critère l'emporte ; un critère en échec n'a pas de verdict. */
  verdict(v: Verdict) {
    if (!this.verdicts.has(v.criterion)) this.verdicts.set(v.criterion, v);
  }

  rules(kind: "violation" | "review", ids?: string[]): AxeRuleResult[] {
    const map = kind === "violation" ? this.violations : this.incomplete;
    return [...map.values()].filter((r) => !ids || ids.includes(r.id));
  }
}

// ---------------------------------------------------------------------------
// Outils injectés dans la page (window.__a4a)
// ---------------------------------------------------------------------------

/** Installé par page.evaluate (contourne la CSP, contrairement à une balise <script>). */
const HELPERS = String.raw`(() => {
  window.__name = window.__name || ((f) => f);
  const uniq = (s) => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
  const sel = (el) => {
    if (!el || el.nodeType !== 1) return "html";
    if (el === document.documentElement) return "html";
    if (el === document.body) return "body";
    if (el.id && uniq("#" + CSS.escape(el.id))) return "#" + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      if (cur.id && uniq("#" + CSS.escape(cur.id))) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      const parent = cur.parentElement;
      const tag = CSS.escape(cur.localName);
      if (!parent) { parts.unshift(tag); break; }
      const same = Array.from(parent.children).filter((c) => c.localName === cur.localName);
      parts.unshift(same.length > 1 ? tag + ":nth-of-type(" + (same.indexOf(cur) + 1) + ")" : tag);
      cur = parent;
    }
    return parts.join(" > ");
  };
  const html = (el, max = 600) => {
    if (!el || el.nodeType !== 1) return "";
    let h = el.outerHTML;
    if (h.length > max) {
      const open = (/^<[^>]*>/.exec(h) || [""])[0];
      h = open.length >= max - 1 ? open.slice(0, max - 1) + "…" : h.slice(0, max - 1) + "…";
    }
    return h;
  };
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const st = getComputedStyle(el);
    if (st.clipPath && st.clipPath !== "none" && /inset\(50%|circle\(0/.test(st.clipPath)) return false;
    if (st.clip && st.clip.startsWith("rect(0") ) return false;
    return true;
  };
  const text = (el) => (el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
  const ownText = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
  const FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [tabindex], [contenteditable=""], [contenteditable="true"], audio[controls], video[controls]';
  const focusables = () => Array.from(document.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled && el.getAttribute("tabindex") !== "-1" && !el.closest("[inert]") && visible(el));
  const labelText = (el) => {
    const parts = [];
    if (el.id) document.querySelectorAll('label[for="' + CSS.escape(el.id) + '"]').forEach((l) => parts.push(text(l)));
    const wrap = el.closest("label"); if (wrap) parts.push(text(wrap));
    const lb = el.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach((id) => { const t = document.getElementById(id); if (t) parts.push(text(t)); });
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    if (el.getAttribute("title")) parts.push(el.getAttribute("title"));
    return parts.join(" ").trim();
  };
  const name = (el) => {
    const lb = el.getAttribute("aria-labelledby");
    if (lb) { const t = lb.split(/\s+/).map((id) => text(document.getElementById(id))).join(" ").trim(); if (t) return t; }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    if (el.localName === "input") return (el.value || el.getAttribute("alt") || labelText(el) || "").trim();
    const t = text(el);
    if (t) return t;
    const img = el.querySelector("img[alt]");
    if (img) return img.getAttribute("alt").trim();
    return (el.getAttribute("title") || "").trim();
  };
  /** Règles CSS de toutes les feuilles lisibles ; partial = une feuille externe n'a pas pu être lue. */
  const cssRules = () => {
    const out = []; let partial = false;
    const walk = (list) => { for (const r of Array.from(list)) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) out.push(r); } };
    for (const s of Array.from(document.styleSheets)) { try { walk(s.cssRules); } catch { partial = true; } }
    return { rules: out, partial };
  };
  const clipped = (el) => {
    const st = getComputedStyle(el);
    const hid = (v) => v === "hidden" || v === "clip";
    if (!hid(st.overflowX) && !hid(st.overflowY) && st.textOverflow !== "ellipsis") return false;
    if (!ownText(el) && !Array.from(el.children).some((c) => /^(span|a|strong|em|b|i|small|label|abbr|code)$/.test(c.localName))) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    return (hid(st.overflowY) && el.scrollHeight > el.clientHeight + 2) || ((hid(st.overflowX) || st.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2);
  };
  const clippedSet = () => {
    const out = new Map();
    const all = document.body ? document.body.querySelectorAll("*") : [];
    let n = 0;
    for (const el of all) { if (++n > 6000) break; if (visible(el) && text(el) && clipped(el)) out.set(sel(el), html(el)); }
    return out;
  };
  window.__a4a = { sel, html, visible, text, ownText, focusables, labelText, name, cssRules, clipped, clippedSet };
})()`;

// ---------------------------------------------------------------------------
// Analyse statique du DOM et des styles
// ---------------------------------------------------------------------------

/** Exécuté dans la page. Doit rester autonome (aucune référence au module). */
function staticChecks(): RawResult & { facts: PageFacts } {
  const A = (window as any).__a4a;
  const items: RawItem[] = [];
  const verdicts: Verdict[] = [];
  const push = (rule: string, kind: "violation" | "review", el: Element | null, note?: string, data?: Record<string, unknown>) => {
    if (!el) return;
    items.push({ rule, kind, sel: A.sel(el), html: A.html(el), ...(note ? { note } : {}), ...(data ? { data } : {}) });
  };
  const na = (ids: string[], reason: string) => ids.forEach((criterion) => verdicts.push({ criterion, status: "NA", reason }));
  const ok = (ids: string[], reason: string) => ids.forEach((criterion) => verdicts.push({ criterion, status: "C", reason }));
  const $$ = (s: string) => Array.from(document.querySelectorAll(s));
  const vis = (el: Element) => A.visible(el);
  const count = (rule: string) => items.filter((i) => i.rule === rule).length;
  const body = document.body;
  const bodyText: string = A.text(body);

  // --- Images (1.1, 1.2, 1.3) --------------------------------------------
  const images = $$('img, [role="img"], input[type="image"], area[href], svg, canvas, object, embed').filter(
    (el) => !el.closest('[aria-hidden="true"]') || el.localName === "img",
  );
  if (images.length === 0) na(["1.1", "1.2", "1.3", "1.6", "1.7", "1.8", "1.9"], "Aucune image (img, svg, canvas, object, embed, zone cliquable) sur l'écran.");
  const BAD_ALT = /^(image|img|photo|picture|pic|logo|icon|icône|icone|illustration|visuel|graphic|graphique|banner|bannière|banniere|untitled|sans titre|null|undefined|alt|spacer|dsc[_ -]?\d+|img[_ -]?\d+|\d+|[\W_]+)$/i;
  for (const img of $$("img[alt], input[type=image][alt]")) {
    const alt = (img.getAttribute("alt") || "").trim();
    if (!alt) continue;
    const src = (img.getAttribute("src") || "").split(/[?#]/)[0];
    const file = src.split("/").pop() || "";
    let note = "";
    if (/\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i.test(alt)) note = `L'alternative est un nom de fichier (« ${alt} »).`;
    else if (BAD_ALT.test(alt)) note = `L'alternative « ${alt} » ne décrit pas l'information de l'image.`;
    else if (file && alt.toLowerCase() === file.replace(/\.[a-z0-9]+$/i, "").toLowerCase()) note = `L'alternative reprend le nom du fichier (« ${alt} »).`;
    else if (alt.length > 150) note = `L'alternative fait ${alt.length} caractères : la garder courte et prévoir une description détaillée (critère 1.6) si nécessaire.`;
    if (note) push("a4a-alt-suspect", "review", img, note);
  }
  for (const svg of $$("svg")) {
    if (svg.parentElement?.closest("svg")) continue;
    if (!vis(svg) || svg.closest('[aria-hidden="true"]')) continue;
    const role = svg.getAttribute("role");
    if (role === "img" || role === "presentation" || role === "none") continue;
    if (svg.getAttribute("aria-label") || svg.getAttribute("aria-labelledby") || svg.querySelector(":scope > title")) continue;
    push("a4a-svg-sans-statut", "review", svg, "Ajouter aria-hidden=\"true\" s'il est décoratif (ou si le texte voisin dit déjà la même chose), sinon role=\"img\" et aria-label.");
    if (count("a4a-svg-sans-statut") >= 15) break;
  }

  // --- CAPTCHA (1.4, 1.5) -------------------------------------------------
  const captcha = $$(
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[src*="captcha"], .g-recaptcha, .h-captcha, .cf-turnstile, .frc-captcha, [class*="captcha" i], [id*="captcha" i], img[src*="captcha" i], input[name*="captcha" i]',
  );
  if (captcha.length === 0) na(["1.4", "1.5"], "Aucun CAPTCHA détecté (reCAPTCHA, hCaptcha, Turnstile, image ou champ « captcha »).");

  // --- Médias (thématique 4) ---------------------------------------------
  const PLAYER = /youtube|youtu\.be|vimeo|dailymotion|wistia|soundcloud|spotify|deezer|peertube|brightcove|jwplayer|kaltura|ted\.com|twitch|ausha|podcast|player/i;
  const temporal = [...$$("video, audio"), ...$$("iframe, embed, object").filter((el) => PLAYER.test(el.getAttribute("src") || el.getAttribute("data") || ""))];
  const nonTemporal = $$("object, embed, applet, canvas").filter((el) => !temporal.includes(el) && vis(el));
  if (temporal.length === 0) na(["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.9", "4.10", "4.11"], "Aucun média temporel (vidéo, audio ou lecteur intégré) sur l'écran.");
  if (nonTemporal.length === 0) na(["4.8", "4.12"], "Aucun média non temporel (object, embed, canvas) sur l'écran.");
  if (temporal.length === 0 && nonTemporal.length === 0) na(["4.13"], "Aucun média sur l'écran.");

  // --- Tableaux (thématique 5) -------------------------------------------
  const tables = $$("table");
  const layoutTables = tables.filter((t) => /^(presentation|none)$/.test(t.getAttribute("role") || ""));
  const dataTables = [...tables.filter((t) => !layoutTables.includes(t)), ...$$('[role="table"], [role="grid"], [role="treegrid"]')];
  if (dataTables.length === 0) na(["5.1", "5.2", "5.4", "5.5", "5.6", "5.7"], "Aucun tableau de données sur l'écran.");
  if (layoutTables.length === 0) na(["5.3", "5.8"], "Aucun tableau de mise en forme sur l'écran.");

  // --- Scripts (7.3, 7.4, 7.5) -------------------------------------------
  const NATIVE = 'a[href], button, input, select, textarea, summary, label, option, iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"], video, audio';
  let clickables = 0;
  for (const el of $$("body *")) {
    if (clickables >= 25) break;
    if (el.matches(NATIVE) || el.closest('a[href], button, label, summary, [role="button"][tabindex], [tabindex]:not([tabindex="-1"])')) continue;
    const onclick = el.hasAttribute("onclick");
    const role = el.getAttribute("role");
    const widgetRole = /^(button|link|tab|menuitem|checkbox|radio|switch|option)$/.test(role || "");
    if (!onclick && !widgetRole) {
      const st = getComputedStyle(el);
      if (st.cursor !== "pointer") continue;
      const parent = el.parentElement;
      if (parent && getComputedStyle(parent).cursor === "pointer") continue;
      if (!vis(el) || !A.text(el)) continue;
      if (el.querySelector(NATIVE)) continue;
      push("a4a-clic-non-focusable", "review", el, "Curseur « main » sur un élément qui ne reçoit pas le focus : s'il déclenche une action, utiliser un <button> ou un lien.");
    } else {
      if (!vis(el)) continue;
      push("a4a-clic-non-focusable", "violation", el, onclick ? "Gestionnaire onclick sur un élément qui ne reçoit pas le focus clavier." : `role="${role}" sans tabindex="0" : l'élément n'est pas atteignable au clavier.`);
    }
    clickables++;
  }
  for (const s of $$("select[onchange]")) push("a4a-select-onchange", "review", s, "Vérifier que changer d'option n'envoie pas le formulaire ou ne change pas de page sans bouton de validation.");

  // --- Formulaires (thématique 11) ---------------------------------------
  const FIELD = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="searchbox"], [role="spinbutton"], [role="slider"], [role="switch"], [role="checkbox"], [role="radio"]';
  const fields = $$(FIELD);
  const forms = $$("form");
  if (fields.length === 0) {
    const reason = "Aucun champ de saisie sur l'écran.";
    na(["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.10", "11.11", "11.12", "11.13", "WCAG-3.3.7", "WCAG-3.3.8"], reason);
    if (forms.length === 0) na(["11.9"], "Aucun formulaire sur l'écran.");
  } else {
    if (!$$('input[type="password"], [autocomplete~="one-time-code"], [autocomplete~="current-password"]').length) {
      na(["WCAG-3.3.8"], "Aucun champ de mot de passe ni de code de connexion sur l'écran.");
    }
    if (!$$('[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"]), output').length) {
      push("a4a-statut-absent", "review", forms[0] ?? fields[0], "Aucune zone role=\"status\", role=\"alert\" ou aria-live : vérifier que les messages (envoi réussi, erreurs, nombre de résultats) sont annoncés au lecteur d'écran.");
    }
  }
  // Regroupements (11.5, 11.6)
  const groups = new Map<string, Element[]>();
  for (const el of $$('input[type="radio"][name], input[type="checkbox"][name]')) {
    const k = `${el.getAttribute("type")}|${el.closest("form") ? A.sel(el.closest("form")) : ""}|${el.getAttribute("name")}`;
    groups.set(k, [...(groups.get(k) ?? []), el]);
  }
  let groupIssues = 0;
  for (const els of groups.values()) {
    if (els.length < 2) continue;
    const box = els[0].closest('fieldset, [role="group"], [role="radiogroup"]');
    if (!box || !els.every((e) => box.contains(e))) {
      const common = els.reduce<Element | null>((acc, e) => {
        let a = acc;
        while (a && !a.contains(e)) a = a.parentElement;
        return a;
      }, els[0].parentElement);
      push("a4a-groupe-sans-fieldset", "violation", common ?? els[0], `${els.length} ${els[0].getAttribute("type") === "radio" ? "boutons radio" : "cases à cocher"} « ${els[0].getAttribute("name")} » sans <fieldset> ni role="group".`);
      groupIssues++;
    }
  }
  const boxes = $$('fieldset, [role="group"], [role="radiogroup"]').filter((b) => b.querySelector(FIELD));
  for (const b of boxes) {
    const legend = b.localName === "fieldset" ? A.text(b.querySelector(":scope > legend")) : "";
    const label = b.getAttribute("aria-label") || (b.getAttribute("aria-labelledby") ? A.name(b) : "");
    if (!legend && !label) push("a4a-groupe-sans-legende", "violation", b, b.localName === "fieldset" ? "<fieldset> sans <legend>." : `role="${b.getAttribute("role")}" sans aria-label ni aria-labelledby.`);
  }
  if (boxes.length === 0 && groupIssues === 0) na(["11.6"], "Aucun regroupement de champs sur l'écran.");
  else if (count("a4a-groupe-sans-legende") === 0 && boxes.length) ok(["11.6"], `Les ${boxes.length} regroupement(s) de champs ont une légende.`);
  // Boutons (11.9)
  const GENERIC = /^(ok|go|>|»|→|button|bouton|submit|cliquez ici|clic|click|click here|ici|here|envoyer|valider|suite|suivant|more|plus|\+|x|×)$/i;
  for (const b of $$('button, input[type="submit"], input[type="button"], input[type="reset"], [role="button"]')) {
    if (!vis(b)) continue;
    const nm = A.name(b) as string;
    const visibleText = (b.localName === "input" ? (b as HTMLInputElement).value : A.text(b)).trim();
    const label = b.getAttribute("aria-label") || "";
    if (label && visibleText && visibleText.length > 1 && !label.toLowerCase().includes(visibleText.toLowerCase())) {
      push("a4a-bouton-nom-visible", "violation", b, `Texte visible « ${visibleText} », nom donné aux lecteurs d'écran « ${label} » : le nom doit contenir le texte visible (commande vocale).`);
    } else if (nm && GENERIC.test(nm) && !b.closest('form[role="search"], [role="search"]')) {
      push("a4a-bouton-generique", "review", b, `Intitulé « ${nm} » : vérifier qu'il dit clairement l'action (ex. « Envoyer ma demande », « Rechercher »).`);
    }
  }
  // Champs obligatoires (11.10)
  const required = $$('[required], [aria-required="true"]').filter((el) => el.matches(FIELD));
  const pageHint = /obligatoire|requis|required|\*/i.test(forms.map((f) => A.ownText(f)).join(" ") + $$("form p, form legend").map((e) => A.text(e)).join(" "));
  for (const f of required) {
    const lt = A.labelText(f) as string;
    if (!/\*|obligatoire|requis|required/i.test(lt) && !pageHint) push("a4a-champ-obligatoire", "review", f, `Étiquette « ${lt || "(aucune)"} » : le caractère obligatoire n'est indiqué que par l'attribut required, invisible avant l'envoi.`);
  }
  // Autocomplete (11.13)
  const PERSONAL: Array<[RegExp, string]> = [
    [/e-?mail|courriel|mél\b|mail/i, "email"],
    [/pr[ée]nom|first.?name|given.?name|fname/i, "given-name"],
    [/nom de famille|last.?name|family.?name|surname|lname/i, "family-name"],
    [/nom complet|full.?name/i, "name"],
    [/t[ée]l[ée]phone|\btel\b|phone|mobile|portable/i, "tel"],
    [/code.?postal|postal|zip|\bcp\b/i, "postal-code"],
    [/ville|city|commune|localit/i, "address-level2"],
    [/\bpays\b|country/i, "country-name"],
    [/adresse|address|\brue\b|street/i, "street-address"],
    [/naissance|birth|bday/i, "bday"],
    [/soci[ée]t[ée]|entreprise|organisation|organization|company|raison sociale/i, "organization"],
    [/identifiant|username|user.?name|login/i, "username"],
  ];
  let personal = 0;
  for (const f of $$("input, select, textarea")) {
    const type = (f.getAttribute("type") || "text").toLowerCase();
    if (/^(hidden|submit|button|reset|image|checkbox|radio|file|range|color|search)$/.test(type) || !vis(f)) continue;
    let token = type === "email" ? "email" : type === "tel" ? "tel" : type === "password" ? "current-password" : "";
    if (!token) {
      const hay = [f.getAttribute("name"), f.id, f.getAttribute("placeholder"), A.labelText(f)].filter(Boolean).join(" ");
      if (/recherche|search|message|commentaire|sujet|objet|quantit|code promo|coupon/i.test(hay)) continue;
      const hit = PERSONAL.find(([re]) => re.test(hay));
      // « Nom » seul désigne la personne ; « Nom du projet » ou « Nom de l'audit », non.
      const parts = [f.getAttribute("name"), f.id, A.labelText(f)].map((x) => (x || "").trim().replace(/\s*(\*|:|\(obligatoire\))\s*$/i, ""));
      const lone = parts.some((x) => /^(votre |your )?(nom|name|lastname|last_name|nom_famille)$/i.test(x));
      if (!hit && !lone) continue;
      token = /e-?mail|courriel/i.test(hay) ? "email" : hit ? hit[1] : "family-name";
    }
    personal++;
    const ac = (f.getAttribute("autocomplete") || "").trim().toLowerCase();
    if (!ac || ac === "off" || ac === "on" || ac === "nope" || ac === "false") {
      push("a4a-autocomplete-manquant", "violation", f, `Champ d'information personnelle : ajouter autocomplete="${token}".`, { autocomplete: token });
    }
  }
  if (fields.length && personal === 0) na(["11.13"], "Aucun champ demandant une information personnelle (nom, e-mail, téléphone, adresse…).");
  else if (personal && count("a4a-autocomplete-manquant") === 0) ok(["11.13"], `Les ${personal} champ(s) d'information personnelle ont un attribut autocomplete.`);

  // --- Éléments obligatoires (8.2, 8.6) ----------------------------------
  const ids = new Map<string, Element[]>();
  for (const el of $$("[id]")) {
    const id = el.id;
    if (id) ids.set(id, [...(ids.get(id) ?? []), el]);
  }
  for (const [id, els] of ids) if (els.length > 1) push("a4a-id-duplique", "violation", els[1], `id="${id}" est utilisé ${els.length} fois : chaque id doit être unique (les étiquettes et aria-labelledby visent le premier).`);
  const title = (document.title || "").trim();
  const h1 = A.text(document.querySelector("h1")) as string;
  const host = location.hostname.replace(/^www\./, "");
  const GENERIC_TITLE = /^(accueil|home|page|untitled|sans titre|document|index|react app|vite app|vite \+ \w+|my app|app|welcome|bienvenue|titre|title|nouvel onglet|new tab)$/i;
  if (title && (GENERIC_TITLE.test(title) || title.length < 4 || title.toLowerCase() === host.toLowerCase())) {
    push("a4a-titre-page-generique", "review", document.documentElement, `Titre « ${title} » : il doit dire où l'on est (ex. « Contact – Nom du site »).`);
  } else if (title && h1) {
    const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const hw = words(h1);
    const tw = new Set(words(title));
    if (hw.length && hw.filter((w) => tw.has(w)).length / hw.length >= 0.5) ok(["8.6"], `Le titre de la page (« ${title} ») reprend le titre principal h1 (« ${h1.slice(0, 80)} »).`);
  }

  // --- Balises de présentation (8.9) -------------------------------------
  for (const p of $$("p")) {
    if (count("a4a-balise-presentation") >= 10) break;
    if (p.textContent!.replace(/[\s ]/g, "") === "" && !p.querySelector("img, svg, input, button, iframe, video, canvas, object") && p.getBoundingClientRect().height > 4) {
      push("a4a-balise-presentation", "violation", p, "Paragraphe vide utilisé pour créer de l'espace : utiliser une marge CSS.");
    }
  }
  for (const br of $$("br + br")) {
    if (count("a4a-balise-presentation") >= 10) break;
    const prev = br.previousSibling;
    if (prev && prev.nodeType === 1 && (prev as Element).localName === "br") push("a4a-balise-presentation", "violation", br.parentElement, "Sauts de ligne <br> successifs utilisés pour créer de l'espace : utiliser des paragraphes et une marge CSS.");
  }

  // --- Titres (9.1) ------------------------------------------------------
  const baseSize = parseFloat(getComputedStyle(body).fontSize) || 16;
  let fake = 0;
  for (const el of $$("body p, body div, body span, body strong, body b, body dt")) {
    if (fake >= 10) break;
    const t = A.ownText(el) as string;
    if (t.length < 3 || t.length > 90 || /[.:;!?]$/.test(t) && t.length > 60) continue;
    if (el.closest('h1, h2, h3, h4, h5, h6, [role="heading"], a, button, label, legend, caption, th, summary, nav, footer, [role="navigation"], [role="banner"] a, blockquote, figcaption')) continue;
    const st = getComputedStyle(el);
    const size = parseFloat(st.fontSize);
    if (size < Math.max(baseSize * 1.25, 19) || Number(st.fontWeight) < 600) continue;
    if (!/block|flex|grid|list-item/.test(st.display) && !/block|flex|grid/.test(getComputedStyle(el.parentElement!).display)) continue;
    if (!vis(el)) continue;
    push("a4a-faux-titre", "review", el, `Texte en ${Math.round(size)} px gras (« ${t.slice(0, 60)} ») : s'il introduit une section, le baliser en titre (h2, h3…).`);
    fake++;
  }

  // --- Zones (9.2, 12.6) -------------------------------------------------
  const inSection = "article, aside, main, nav, section, [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";
  const banner = $$('header, [role="banner"]').some((h) => h.getAttribute("role") === "banner" || !h.parentElement?.closest(inSection));
  const contentinfo = $$('footer, [role="contentinfo"]').some((h) => h.getAttribute("role") === "contentinfo" || !h.parentElement?.closest(inSection));
  const nav = $$('nav, [role="navigation"]').length > 0;
  const main = $$('main, [role="main"]').length > 0;
  const missing = [!banner && "en-tête (header)", !nav && "navigation (nav)", !main && "contenu principal (main)", !contentinfo && "pied de page (footer)"].filter(Boolean);
  if (missing.length === 0) ok(["9.2", "12.6"], "En-tête, navigation, contenu principal et pied de page sont identifiés (header, nav, main, footer).");
  else if (missing.length < 4) push("a4a-zones-manquantes", "review", document.documentElement, `Zones non identifiées : ${missing.join(", ")}. Si elles existent visuellement, les baliser.`);

  // --- Présentation (10.1, 10.2, 10.3, 10.5, 10.10) ----------------------
  const PRES_TAGS = "font, center, basefont, big, blink, marquee, s, strike, tt";
  const PRES_ATTRS = ["align", "alink", "background", "bgcolor", "border", "cellpadding", "cellspacing", "char", "charoff", "clear", "color", "compact", "face", "hspace", "link", "noshade", "nowrap", "text", "valign", "vlink", "vspace"];
  const SIZE_OK = /^(img|svg|canvas|embed|iframe|object|video|source|picture|input|td|th|col|colgroup)$/;
  let pres = 0;
  for (const el of $$("body, body *")) {
    if (pres >= 15) break;
    if (el.closest("svg, math")) continue;
    const bad: string[] = [];
    if (el.matches(PRES_TAGS)) bad.push(`<${el.localName}>`);
    for (const a of PRES_ATTRS) if (el.hasAttribute(a) && !(a === "border" && el.localName === "img" && el.getAttribute("border") === "0")) bad.push(a);
    if (!SIZE_OK.test(el.localName)) for (const a of ["width", "height"]) if (el.hasAttribute(a)) bad.push(a);
    if (bad.length) {
      push("a4a-attribut-presentation", "violation", el, `Présentation dans le HTML : ${bad.join(", ")}. La déplacer dans la feuille de styles.`, { attrs: bad.filter((b) => !b.startsWith("<")) });
      pres++;
    }
  }
  if (pres === 0) ok(["10.1"], "Aucune balise ni attribut HTML de présentation (font, center, align, bgcolor, width…) : la présentation passe par les CSS.");

  const css = A.cssRules() as { rules: CSSStyleRule[]; partial: boolean };
  let cssInfo = 0;
  const all = $$("body *").slice(0, 4000);
  for (const el of all) {
    if (cssInfo >= 10) break;
    for (const pseudo of ["::before", "::after"]) {
      const c = getComputedStyle(el, pseudo).content;
      if (!c || c === "none" || c === "normal" || !c.startsWith('"')) continue;
      const v = c.slice(1, -1).replace(/\\[0-9a-f]{1,6}\s?/gi, (m) => String.fromCodePoint(parseInt(m.slice(1), 16)));
      const icon = /[-]/.test(v);
      const words = /[\p{L}\p{N}]{2,}/u.test(v);
      if (!words && !(icon && !A.name(el.closest("a, button") ?? el))) continue;
      if (!vis(el)) continue;
      push("a4a-contenu-css", "review", el, icon ? "Icône de police générée en CSS, sans texte alternatif : elle disparaît sans CSS." : `Texte « ${v.slice(0, 60)} » généré par CSS (${pseudo}) : il disparaît sans CSS et n'est pas toujours lu.`);
      cssInfo++;
      break;
    }
  }
  const reorder = $$("body *").filter((el) => {
    const st = getComputedStyle(el);
    if (/reverse/.test(st.flexDirection) && el.children.length > 1 && /flex/.test(st.display)) return vis(el) && A.text(el);
    return st.order !== "0" && /flex|grid/.test(getComputedStyle(el.parentElement!).display) && vis(el) && A.text(el);
  });
  for (const el of reorder.slice(0, 10)) push("a4a-ordre-css", "review", el, "L'ordre d'affichage est modifié en CSS (order ou *-reverse) : sans CSS ou au clavier, la lecture suit l'ordre du code.");
  if (cssInfo === 0 && reorder.length === 0) {
    ok(["10.2"], "Aucun texte ni icône générés en CSS (::before, ::after) : l'information reste présente sans CSS.");
    ok(["10.3"], "L'ordre visuel n'est pas modifié en CSS (pas de order ni de *-reverse) : le contenu reste dans l'ordre sans CSS.");
  }

  const transparent = (c: string) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
  const rootBg = getComputedStyle(document.documentElement).backgroundColor;
  const bodyBg = getComputedStyle(body).backgroundColor;
  if (transparent(rootBg) && transparent(bodyBg)) {
    const UA = "a, a *, button, button *, input, select, textarea, mark, option, summary, legend";
    const colored = getComputedStyle(body).color !== "rgb(0, 0, 0)" || $$("body *").slice(0, 2000).some((el) => !el.matches(UA) && A.ownText(el) && getComputedStyle(el).color !== "rgb(0, 0, 0)" && vis(el));
    if (colored) push("a4a-couleurs-css", "violation", body, "La page déclare des couleurs de texte mais pas de couleur de fond (html et body transparents) : avec un fond par défaut sombre, le texte devient illisible. Déclarer background-color sur body.");
  }

  const SHAPE = /\b(ci-dessous|ci-dessus|à (droite|gauche)|en haut à|en bas à|colonne de (droite|gauche)|(bouton|pastille|rond|carré|icône|cercle|lien) (vert|rouge|bleu|orange|jaune|gris)|en (rouge|vert|bleu|orange)|indiqués? en gras)\b/i;
  let shape = 0;
  for (const el of $$("p, li, span, label, legend, td, dd, div")) {
    if (shape >= 8) break;
    const t = A.ownText(el) as string;
    if (t && SHAPE.test(t) && vis(el)) {
      push("a4a-forme-position", "review", el, `« ${t.slice(0, 90)} » : vérifier que l'information ne repose pas seulement sur la position, la forme ou la couleur.`);
      shape++;
    }
  }

  // --- Contenus additionnels (10.13, 10.14, 12.11) -----------------------
  const hoverReveal: string[] = [];
  if (!css.partial || css.rules.length) {
    const focusSel = new Set<string>();
    for (const r of css.rules) for (const s of r.selectorText.split(",")) if (/:focus/.test(s)) focusSel.add(s.trim().replace(/:focus-within|:focus-visible|:focus/g, ":hover"));
    for (const r of css.rules) {
      const st = r.style;
      const reveals = (st.display && st.display !== "none") || st.visibility === "visible" || (st.opacity && st.opacity !== "0") || st.maxHeight || st.clip || st.clipPath || st.transform || st.left || st.top;
      if (!reveals) continue;
      for (const s of r.selectorText.split(",").map((x) => x.trim())) {
        if (!/:hover\s*[>+~ ]\s*\S/.test(s) && !/:hover\S*\s+\S/.test(s)) continue;
        if (focusSel.has(s)) continue;
        hoverReveal.push(s);
      }
    }
  }
  const seenHover = new Set<string>();
  for (const s of hoverReveal) {
    if (seenHover.size >= 8) break;
    const trigger = s.slice(0, s.indexOf(":hover")).replace(/:hover/g, "") || "*";
    let el: Element | null = null;
    try { el = document.querySelector(trigger); } catch { /* sélecteur non supporté */ }
    if (!el || seenHover.has(A.sel(el))) continue;
    seenHover.add(A.sel(el));
    push("a4a-survol-seul", "violation", el, `La règle CSS « ${s} » affiche un contenu au survol, sans équivalent :focus ou :focus-within : il reste inaccessible au clavier.`, { selector: s });
  }
  const popups = $$('[aria-expanded], [aria-haspopup], [popover], [popovertarget], details, dialog, [role="dialog"], [role="tooltip"], [data-tooltip], [data-toggle], [data-bs-toggle], [class*="tooltip" i], [class*="dropdown" i], [class*="popover" i], [class*="submenu" i], [class*="sous-menu" i]');
  const hoverRules = css.rules.filter((r) => /:hover\S*\s*[>+~ ]\s*\S/.test(r.selectorText));
  if (!css.partial) {
    if (hoverRules.length === 0) na(["10.14"], "Aucune règle CSS n'affiche de contenu au survol (:hover).");
    else if (hoverReveal.length === 0) ok(["10.14"], "Les contenus affichés au survol en CSS le sont aussi au focus (:focus ou :focus-within).");
    if (popups.length === 0 && hoverRules.length === 0) na(["10.13", "12.11"], "Aucun contenu additionnel (infobulle, menu déroulant, fenêtre, élément dépliable) détecté.");
  }

  // --- Navigation (12.7) -------------------------------------------------
  const foc = A.focusables() as Element[];
  const firstLinks = foc.slice(0, 4);
  const skip = firstLinks.find((a) => {
    const href = a.getAttribute("href") || "";
    if (a.localName !== "a" || !href.startsWith("#") || href.length < 2 || /^#top$/i.test(href)) return false;
    const id = decodeURIComponent(href.slice(1));
    return !!(document.getElementById(id) || document.getElementsByName(id).length);
  });
  const mainEl = document.querySelector('main, [role="main"]');
  const before = mainEl ? foc.filter((el) => mainEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING && !mainEl.contains(el)).length : foc.length;
  if (skip) ok(["12.7"], `Lien d'évitement présent en début de page : « ${A.text(skip) || skip.getAttribute("href")} » vers ${skip.getAttribute("href")}.`);
  else if (before >= 3) {
    const broken = firstLinks.find((a) => a.localName === "a" && /^#./.test(a.getAttribute("href") || "") && /contenu|content|main|principal|aller|skip|passer/i.test(A.text(a)));
    push("a4a-lien-evitement", "violation", broken ?? document.documentElement, broken ? `Le lien « ${A.text(broken)} » vise ${broken.getAttribute("href")}, qui n'existe pas dans la page.` : `${before} éléments à tabuler avant le contenu principal, et aucun lien « Aller au contenu » en tout début de page.`);
  }

  // --- Mouvement et gestes (13.8, 13.10, WCAG 2.5.7) ---------------------
  const moving: Element[] = [];
  for (const anim of (document.getAnimations?.() ?? []) as any[]) {
    const t = anim.effect?.target as Element | undefined;
    if (!t || !vis(t)) continue;
    const timing = anim.effect.getComputedTiming();
    const total = timing.iterations === Infinity ? Infinity : (Number(timing.duration) || 0) * timing.iterations;
    const r = t.getBoundingClientRect();
    if (total > 5000 && r.width * r.height > 48 * 48 && !moving.includes(t)) moving.push(t);
  }
  const carousels = $$('[aria-roledescription="carousel" i], [aria-roledescription="carrousel" i], .swiper, .slick-slider, .splide, .glide, .owl-carousel, .carousel, .flickity-enabled, [data-autoplay], marquee, blink, video[autoplay]').filter(vis);
  const gifs = $$('img[src$=".gif" i], img[src*=".gif?" i]').filter((i) => vis(i) && i.getBoundingClientRect().width > 48);
  const allMoving = [...new Set([...moving, ...carousels, ...gifs])];
  for (const el of allMoving.slice(0, 8)) push("a4a-animation", "review", el, "Contenu animé plus de 5 secondes ou carrousel : il faut un bouton pour le mettre en pause, l'arrêter ou le masquer.");
  if (allMoving.length === 0) na(["13.8"], "Aucun contenu en mouvement ou clignotant (animation longue, carrousel, GIF, vidéo automatique) au chargement.");
  const drag = $$('[draggable="true"], [aria-grabbed], [data-rbd-draggable-id], [data-rfd-draggable-id], [data-sortable], .sortable, .ui-draggable, .ui-sortable, .swiper, .slick-slider, .splide, .glide, .flickity-enabled, .leaflet-container, .mapboxgl-map, .maplibregl-map, .gm-style, .ol-viewport').filter(vis);
  for (const el of drag.slice(0, 6)) push("a4a-glisser", "review", el, "Composant à glisser ou à geste (carrousel, carte, liste triable) : vérifier qu'un simple clic ou des boutons suffisent à tout faire.");
  if (drag.length === 0) na(["13.10", "WCAG-2.5.7"], "Aucun glisser-déposer, carrousel tactile, liste triable ni carte interactive détectés.");

  // --- Repères pour la comparaison entre écrans --------------------------
  const navEl = document.querySelector('nav, [role="navigation"]');
  const landmarks = $$('header, nav, main, aside, footer, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]');
  let navFacts: PageFacts["nav"];
  if (navEl && vis(navEl)) {
    const r = navEl.getBoundingClientRect();
    navFacts = { top: Math.round(r.top + scrollY), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), order: landmarks.indexOf(navEl) };
  }
  return { items, verdicts, facts: { title, h1, nav: navFacts } };
}

// ---------------------------------------------------------------------------
// Navigation au clavier (10.7, 12.8, 12.9, 7.4, WCAG 2.4.11)
// ---------------------------------------------------------------------------

interface FocusInfo {
  inDoc: boolean;
  sel: string;
  html: string;
  sig: string;
  iframe: boolean;
  visible: boolean;
  rect: { x: number; y: number; width: number; height: number };
  absTop: number;
  obscured: boolean;
  obscuredBy?: string;
}

/** Exécuté dans la page : élément qui a le focus, sa position et s'il est masqué. */
function focusInfo(): FocusInfo {
  const A = (window as any).__a4a;
  const el = document.activeElement;
  const empty = { inDoc: false, sel: "", html: "", sig: "", iframe: false, visible: false, rect: { x: 0, y: 0, width: 0, height: 0 }, absTop: 0, obscured: false };
  if (!el || el === document.body || el === document.documentElement) return empty;
  let r = el.getBoundingClientRect();
  const vw = innerWidth;
  const vh = innerHeight;
  // Champ masqué visuellement (case, fichier) dont l'étiquette visible porte l'indication de focus.
  const labels = (el as HTMLInputElement).labels;
  if (!A.visible(el) && labels?.length && A.visible(labels[0])) r = labels[0].getBoundingClientRect();
  const inView = r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  const visible = (A.visible(el) || (!!labels?.length && A.visible(labels[0]))) && inView;
  let obscured = false;
  let obscuredBy: string | undefined;
  if (visible) {
    const x1 = Math.max(r.left + 2, 1), x2 = Math.min(r.right - 2, vw - 1), y1 = Math.max(r.top + 2, 1), y2 = Math.min(r.bottom - 2, vh - 1);
    const pts = [[(x1 + x2) / 2, (y1 + y2) / 2], [x1, y1], [x2, y1], [x1, y2], [x2, y2]];
    let covered = 0;
    for (const [x, y] of pts) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      let p: Element | null = hit;
      let fixed = false;
      while (p && p !== document.body) {
        const pos = getComputedStyle(p).position;
        if (pos === "fixed" || pos === "sticky") { fixed = true; break; }
        p = p.parentElement;
      }
      if (fixed) { covered++; obscuredBy = A.sel(p); }
    }
    obscured = covered === pts.length;
  }
  const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.split(/\s+/).filter(Boolean).sort().join(".") : "";
  return {
    inDoc: true,
    sel: A.sel(el),
    html: A.html(el, 400),
    sig: `${el.localName}|${cls}|${el.getAttribute("role") ?? ""}|${el.getAttribute("type") ?? ""}`,
    iframe: el.localName === "iframe",
    visible,
    rect: { x: r.left, y: r.top, width: r.width, height: r.height },
    absTop: r.top + scrollY,
    obscured,
    ...(obscuredBy ? { obscuredBy } : {}),
  };
}

async function shot(page: Page, rect: FocusInfo["rect"], pad = 6): Promise<Buffer | undefined> {
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const width = Math.min(vp.width, rect.x + rect.width + pad) - x;
  const height = Math.min(vp.height, rect.y + rect.height + pad) - y;
  if (width < 2 || height < 2) return undefined;
  return page.screenshot({ clip: { x, y, width, height }, animations: "disabled", caret: "hide" }).catch(() => undefined);
}

async function contextShot(page: Page, rect: FocusInfo["rect"]): Promise<string | undefined> {
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  const width = Math.min(vp.width, Math.max(640, rect.width + 96));
  const height = Math.min(vp.height, Math.max(240, rect.height + 96));
  const x = Math.min(Math.max(0, rect.x + rect.width / 2 - width / 2), vp.width - width);
  const y = Math.min(Math.max(0, rect.y + rect.height / 2 - height / 2), vp.height - height);
  const buf = await page.screenshot({ clip: { x, y, width, height }, type: "jpeg", quality: 75, animations: "disabled" }).catch(() => undefined);
  return buf ? `data:image/jpeg;base64,${buf.toString("base64")}` : undefined;
}

/** Nombre de prises de focus comparées en capture par « famille » d'éléments (même balise et mêmes classes). */
const PER_SIGNATURE = 2;
const MAX_COMPARISONS = 60;

async function keyboardWalk(page: Page, col: Collector, url: string, maxTabs: number): Promise<void> {
  const total = (await page.evaluate("window.__a4a.focusables().length")) as number;
  if (total === 0) {
    const reason = "Aucun élément ne reçoit le focus clavier sur l'écran.";
    for (const c of ["10.7", "12.8", "12.9", "WCAG-2.4.11"]) col.verdict({ criterion: c, status: "NA", reason });
    return;
  }
  // Point de départ : tout début de la page (un élément temporaire hors tabulation reçoit le focus).
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const start = document.createElement("span");
    start.setAttribute("tabindex", "-1");
    start.setAttribute("data-access4all-start", "");
    document.body.prepend(start);
    start.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });
  const limit = Math.min(maxTabs, total * 2 + 10);
  const visits = new Map<string, number>();
  const tested = new Map<string, number>();
  const seq: FocusInfo[] = [];
  let cycle = false;
  let trap: FocusInfo | undefined;
  let comparisons = 0;
  let invisible = 0;
  let iframeRepeat = 0;
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(30);
    if (page.url() !== url) {
      const prev = seq[seq.length - 1];
      col.add({ rule: "a4a-changement-contexte-focus", kind: "violation", sel: prev?.sel ?? "html", html: prev?.html ?? "", note: `En tabulant, la page a changé d'adresse (${page.url()}) sans action de l'utilisateur.` });
      await page.goto(url, { waitUntil: "load" }).catch(() => {});
      await page.evaluate(HELPERS);
      return;
    }
    const info = (await page.evaluate(focusInfo).catch(() => undefined)) as FocusInfo | undefined;
    if (!info) break;
    if (!info.inDoc) {
      if (seq.length) {
        cycle = true;
        break;
      }
      continue;
    }
    if (seq.length > 1 && info.sel === seq[0].sel) {
      cycle = true;
      break;
    }
    const prev = seq[seq.length - 1];
    if (info.iframe && prev?.sel === info.sel) {
      // Le focus parcourt le contenu d'un cadre (lecteur vidéo, carte…) : on continue.
      if (++iframeRepeat > 60) break;
      continue;
    }
    if (prev?.sel === info.sel) {
      // Tab reste sur le même élément : champ composé (date, heure) ou lecteur média. Ce n'est pas un piège.
      if (++iframeRepeat > 12) break;
      continue;
    }
    iframeRepeat = 0;
    const n = (visits.get(info.sel) ?? 0) + 1;
    visits.set(info.sel, n);
    if (n > 1) {
      trap = info;
      break;
    }
    seq.push(info);

    if (!info.visible && !info.iframe) {
      invisible++;
      if (invisible <= 10) col.add({ rule: "a4a-focus-element-cache", kind: "violation", sel: info.sel, html: info.html, note: "Le focus arrive sur cet élément alors qu'il n'est pas visible à l'écran (menu fermé, élément masqué ou hors écran) : l'utilisateur ne sait plus où il est." }, { visibility: "hidden" });
      continue;
    }
    if (info.obscured) {
      col.add({ rule: "a4a-focus-masque", kind: "violation", sel: info.sel, html: info.html, note: `L'élément qui a le focus est entièrement recouvert par ${info.obscuredBy ?? "un élément fixe"} (en-tête collant, bandeau cookies…).` }, { screenshot: await contextShot(page, info.rect), visibility: "visible" });
    }
    // Focus visible : on compare l'élément avec et sans le focus.
    const done = tested.get(info.sig) ?? 0;
    if (info.iframe || done >= PER_SIGNATURE || comparisons >= MAX_COMPARISONS) continue;
    tested.set(info.sig, done + 1);
    comparisons++;
    const withFocus = await shot(page, info.rect);
    await page.evaluate(() => {
      (window as any).__a4aLast = document.activeElement;
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    await page.waitForTimeout(20);
    const without = await shot(page, info.rect);
    const focused = await contextShot(page, info.rect);
    await page.evaluate(() => (window as any).__a4aLast?.focus?.({ preventScroll: true }));
    if (withFocus && without && withFocus.equals(without)) {
      col.add({ rule: "a4a-focus-invisible", kind: "violation", sel: info.sel, html: info.html, note: "La capture de l'élément est identique avec et sans le focus : rien n'indique où se trouve le focus clavier." }, { screenshot: focused, visibility: "visible" });
    }
  }

  await page.evaluate(() => document.querySelector("[data-access4all-start]")?.remove()).catch(() => {});
  // Piège au clavier (12.9)
  if (trap) {
    col.add({ rule: "a4a-piege-clavier", kind: "violation", sel: trap.sel, html: trap.html, note: `Après ${seq.length} tabulations, le focus revient sur cet élément sans avoir atteint la fin de la page : la touche Tab tourne en rond.` });
  } else if (cycle) {
    col.verdict({ criterion: "12.9", status: "C", reason: `La touche Tab parcourt les ${seq.length} éléments focalisables puis sort de la page, sans blocage.` });
  }
  // Focus visible (10.7) et non masqué (2.4.11)
  const v107 = col.rules("violation", ["a4a-focus-invisible", "a4a-focus-element-cache"]).length;
  if (!v107 && comparisons > 0) col.verdict({ criterion: "10.7", status: "C", reason: `Focus visible sur les ${comparisons} types d'éléments testés (comparaison de captures avec et sans focus, ${seq.length} éléments parcourus).` });
  if (!col.rules("violation", ["a4a-focus-masque"]).length && seq.length) col.verdict({ criterion: "WCAG-2.4.11", status: "C", reason: `Aucun des ${seq.length} éléments parcourus au clavier n'est caché par un élément fixe quand il reçoit le focus.` });

  // Ordre de tabulation (12.8) : retours en arrière nets dans la page.
  let jumps = 0;
  for (let i = 1; i < seq.length && jumps < 8; i++) {
    const a = seq[i - 1];
    const b = seq[i];
    if (!a.visible || !b.visible) continue;
    if (b.absTop < a.absTop - 250) {
      col.add({ rule: "a4a-ordre-tabulation", kind: "review", sel: b.sel, html: b.html, note: `Le focus remonte de ${Math.round(a.absTop - b.absTop)} px en passant de « ${a.sel} » à cet élément : vérifier que l'ordre reste logique.` });
      jumps++;
    }
  }
  if (jumps === 0 && cycle && seq.length > 1) col.verdict({ criterion: "12.8", status: "C", reason: `L'ordre de tabulation suit l'ordre de lecture, de haut en bas, sur les ${seq.length} éléments.` });
}

// ---------------------------------------------------------------------------
// Affichage : reflow, zoom, espacement, orientation (10.4, 10.11, 10.12, 13.9)
// ---------------------------------------------------------------------------

/** Exécuté dans la page : éléments qui débordent du bord droit (contenu coupé ou défilement horizontal). */
function overflowCheck(): { overflow: boolean; items: Array<{ sel: string; html: string; right: number }> } {
  const A = (window as any).__a4a;
  const vw = document.documentElement.clientWidth;
  const overflow = (document.scrollingElement ?? document.documentElement).scrollWidth > vw + 2;
  const EXEMPT = 'table, pre, code, svg, canvas, video, iframe, map, [role="application"], [role="grid"], [role="table"], .leaflet-container, .gm-style, .mapboxgl-map, .swiper, .slick-slider, .splide, .glide, .owl-carousel, .carousel';
  const items: Array<{ sel: string; html: string; right: number }> = [];
  const crossing = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.left < vw - 1 && r.right > vw + 2;
  };
  for (const el of Array.from(document.body?.querySelectorAll("*") ?? []).slice(0, 6000)) {
    if (items.length >= 12) break;
    if (!crossing(el) || el.closest(EXEMPT) || !A.visible(el)) continue;
    if (el.parentElement && el.parentElement !== document.body && crossing(el.parentElement) && !el.parentElement.closest(EXEMPT)) continue;
    let p = el.parentElement;
    let scroller = false;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if ((ox === "auto" || ox === "scroll") && p.scrollWidth > p.clientWidth) { scroller = true; break; }
      p = p.parentElement;
    }
    if (scroller) continue;
    items.push({ sel: A.sel(el), html: A.html(el), right: Math.round(el.getBoundingClientRect().right) });
  }
  return { overflow, items };
}

async function layoutChecks(page: Page, col: Collector, capture?: ChecksOptions["capture"]): Promise<void> {
  const original = page.viewportSize() ?? { width: 1280, height: 800 };
  const settle = () => page.waitForTimeout(250);
  const baseline = new Set(Object.keys(Object.fromEntries((await page.evaluate("Array.from(window.__a4a.clippedSet().entries())")) as Array<[string, string]>)));
  try {
    // Reflow : 320 px de large (équivaut à un zoom de 400 % sur un écran de 1280 px).
    await page.setViewportSize({ width: 320, height: 640 });
    await settle();
    const reflow = await page.evaluate(overflowCheck);
    for (const it of reflow.items) col.add({ rule: "a4a-reflow", kind: "violation", sel: it.sel, html: it.html, note: `À 320 px de large, cet élément s'étend jusqu'à ${it.right} px : il est coupé ou oblige à faire défiler horizontalement.` });
    if (reflow.overflow && !reflow.items.length) col.add({ rule: "a4a-reflow", kind: "violation", sel: "html", html: "<html>", note: "À 320 px de large, la page défile horizontalement." }, { visibility: "page" });
    if (!reflow.overflow && !reflow.items.length) col.verdict({ criterion: "10.11", status: "C", reason: "À 320 px de large, aucun défilement horizontal ni contenu coupé." });
    await capture?.(col.rules("violation", ["a4a-reflow"]));

    // Zoom 200 % : fenêtre deux fois plus étroite, on cherche le texte coupé qui ne l'était pas.
    await page.setViewportSize({ width: Math.round(original.width / 2), height: Math.round(original.height / 2) });
    await settle();
    const zoomed = (await page.evaluate("Array.from(window.__a4a.clippedSet().entries())")) as Array<[string, string]>;
    const newly = zoomed.filter(([s]) => !baseline.has(s)).slice(0, 10);
    for (const [sel, html] of newly) col.add({ rule: "a4a-zoom-texte-coupe", kind: "violation", sel, html, note: "Avec un zoom à 200 %, le texte de cet élément est coupé (hauteur ou largeur fixe avec overflow: hidden)." });
    if (!newly.length) col.verdict({ criterion: "10.4", status: "C", reason: "Avec un zoom à 200 % (fenêtre deux fois plus étroite), aucun texte n'est coupé ni masqué." });
    await capture?.(col.rules("violation", ["a4a-zoom-texte-coupe"]));

    // Orientation : portrait et paysage d'un téléphone.
    await page.setViewportSize({ width: 390, height: 844 });
    await settle();
    const portrait = (await page.evaluate("(document.body && document.body.innerText || '').length")) as number;
    await page.setViewportSize({ width: 844, height: 390 });
    await settle();
    const landscape = (await page.evaluate("(document.body && document.body.innerText || '').length")) as number;
    const ratio = Math.min(portrait, landscape) / Math.max(portrait, landscape, 1);
    if (ratio < 0.5) {
      col.add({ rule: "a4a-orientation", kind: "violation", sel: "html", html: "<html>", note: `Le texte visible passe de ${portrait} caractères en portrait à ${landscape} en paysage : une partie du contenu disparaît selon l'orientation.` }, { visibility: "page" });
    } else {
      col.verdict({ criterion: "13.9", status: "C", reason: "Le contenu reste affiché en portrait comme en paysage (téléphone 390 × 844)." });
    }
  } finally {
    await page.setViewportSize(original);
    await settle();
  }

  // Espacement du texte (10.12) : valeurs du critère WCAG 1.4.12.
  const handle = await page.evaluateHandle(() => {
    const s = document.createElement("style");
    s.setAttribute("data-access4all", "");
    s.textContent = "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";
    document.head.appendChild(s);
    return s;
  });
  try {
    await settle();
    const spaced = (await page.evaluate("Array.from(window.__a4a.clippedSet().entries())")) as Array<[string, string]>;
    const newly = spaced.filter(([s]) => !baseline.has(s)).slice(0, 10);
    for (const [sel, html] of newly) col.add({ rule: "a4a-espacement-texte", kind: "violation", sel, html, note: "Quand l'utilisateur augmente l'interligne et l'espacement des lettres et des mots, le texte de cet élément est coupé." });
    if (!newly.length) col.verdict({ criterion: "10.12", status: "C", reason: "Avec un espacement augmenté (interligne 1,5, lettres 0,12 em, mots 0,16 em, paragraphes 2 em), aucun texte n'est coupé." });
    await capture?.(col.rules("violation", ["a4a-espacement-texte"]));
  } finally {
    await handle.evaluate((s) => (s as Element).remove()).catch(() => {});
  }
}

/** Infobulles reliées par aria-describedby : elles doivent se fermer avec Échap (10.13). */
async function tooltipChecks(page: Page, col: Collector): Promise<void> {
  const triggers = (await page.evaluate(() => {
    const A = (window as any).__a4a;
    return Array.from(document.querySelectorAll("[aria-describedby]"))
      .filter((el) => (el.getAttribute("aria-describedby") || "").split(/\s+/).some((id) => {
        const t = document.getElementById(id);
        return t && t.getAttribute("role") === "tooltip" && !A.visible(t);
      }))
      .slice(0, 5)
      .map((el) => A.sel(el));
  })) as string[];
  for (const sel of triggers) {
    const shown = await page.evaluate((s) => {
      const A = (window as any).__a4a;
      const el = document.querySelector(s) as HTMLElement | null;
      el?.focus();
      const ids = (el?.getAttribute("aria-describedby") || "").split(/\s+/);
      return ids.some((id) => A.visible(document.getElementById(id)));
    }, sel);
    if (!shown) continue;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const still = await page.evaluate((s) => {
      const A = (window as any).__a4a;
      const el = document.querySelector(s);
      return (el?.getAttribute("aria-describedby") || "").split(/\s+/).some((id) => A.visible(document.getElementById(id)));
    }, sel);
    if (still) {
      const html = (await page.evaluate((s) => (window as any).__a4a.html(document.querySelector(s)), sel)) as string;
      col.add({ rule: "a4a-infobulle-non-masquable", kind: "violation", sel, html, note: "L'infobulle reste affichée après un appui sur Échap : elle peut masquer le contenu sans pouvoir être fermée." });
    }
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}

/** Exécute tous les tests complémentaires sur une page chargée. */
export async function runChecks(page: Page, options: ChecksOptions = {}): Promise<ChecksResult> {
  const col = new Collector();
  const url = page.url();
  await page.evaluate(HELPERS);
  // Souris hors de la page : aucun :hover ne doit fausser les tests.
  await page.mouse.move(-1, -1).catch(() => {});
  let facts: PageFacts | undefined;
  try {
    const s = await page.evaluate(staticChecks);
    facts = s.facts;
    col.addAll(s);
    await options.capture?.([...col.rules("violation"), ...col.rules("review")].filter((r) => r.id !== "a4a-titre-page-generique" && r.id !== "a4a-zones-manquantes"));
  } catch (e) {
    process.stderr.write(`access4all : analyse complémentaire interrompue sur ${url} (${(e as Error).message.split("\n")[0]})\n`);
  }
  for (const step of [
    () => tooltipChecks(page, col),
    () => keyboardWalk(page, col, url, options.maxTabs ?? 150),
    () => layoutChecks(page, col, options.capture),
  ]) {
    try {
      await step();
    } catch (e) {
      process.stderr.write(`access4all : un test interactif a échoué sur ${url} (${(e as Error).message.split("\n")[0]})\n`);
      await page.evaluate(HELPERS).catch(() => {});
    }
  }
  // Un critère en échec ou à vérifier sur la page n'a pas de verdict.
  const flagged = new Set([...col.violations.keys(), ...col.incomplete.keys()]);
  const flaggedCriteria = new Set([...flagged].flatMap((r) => criteriaForAxeRule(r).map((c) => c.id)));
  return {
    violations: col.rules("violation"),
    incomplete: col.rules("review"),
    verdicts: [...col.verdicts.values()].filter((v) => !flaggedCriteria.has(v.criterion)),
    facts,
  };
}

/**
 * Comparaisons entre les écrans d'un produit : titres de page identiques (8.6)
 * et menu de navigation à la même place (12.2).
 */
export function crossPageChecks(pages: Array<{ url: string; facts?: PageFacts; checks?: ChecksResult }>): void {
  const ok = pages.filter((p) => p.facts && p.checks);
  if (ok.length < 2) return;
  const byTitle = new Map<string, typeof ok>();
  for (const p of ok) {
    const t = p.facts!.title.toLowerCase();
    if (t) byTitle.set(t, [...(byTitle.get(t) ?? []), p]);
  }
  for (const [, list] of byTitle) {
    if (list.length < 2) continue;
    for (const p of list) {
      const c = p.checks!;
      c.verdicts = c.verdicts.filter((v) => v.criterion !== "8.6");
      const rule = c.incomplete.find((r) => r.id === "a4a-titre-page-duplique") ?? { id: "a4a-titre-page-duplique", impact: "moderate", help: CHECK_HELP["a4a-titre-page-duplique"], helpUrl: "", nodes: [] };
      if (!c.incomplete.includes(rule)) c.incomplete.push(rule);
      rule.nodes.push({ target: ["html"], html: `<title>${p.facts!.title}</title>`, failureSummary: `Le titre « ${p.facts!.title} » est identique sur ${list.length} écrans : chaque écran doit avoir un titre qui le distingue.`, visibility: "page" });
    }
  }
  const navs = ok.filter((p) => p.facts!.nav);
  if (navs.length < 2) return;
  // Même place : à 24 px près (barre de défilement, police chargée plus tard) et même rang parmi les zones.
  type Nav = NonNullable<PageFacts["nav"]>;
  const same = (a: Nav, b: Nav) => Math.abs(a.top - b.top) <= 24 && Math.abs(a.left - b.left) <= 24 && a.order === b.order;
  const ref = navs
    .map((p) => ({ p, n: navs.filter((q) => same(p.facts!.nav!, q.facts!.nav!)).length }))
    .sort((a, b) => b.n - a.n)[0];
  // Sans majorité nette, on ne sait pas quelle place est la bonne : vérification manuelle.
  if (ref.n * 2 <= navs.length) return;
  for (const p of navs) {
    const c = p.checks!;
    if (same(p.facts!.nav!, ref.p.facts!.nav!)) {
      c.verdicts.push({ criterion: "12.2", status: "C", reason: `Le menu de navigation est au même endroit sur ${ref.n} écrans sur ${navs.length}${ref.n < navs.length ? " (les autres sont signalés)" : ""}.` });
    } else {
      const n = p.facts!.nav!;
      c.violations.push({ id: "a4a-navigation-inconstante", impact: "moderate", help: CHECK_HELP["a4a-navigation-inconstante"], helpUrl: "", nodes: [{ target: ["nav"], html: "<nav>", failureSummary: `Sur cet écran, le menu est à ${n.top} px du haut et ${n.left} px de la gauche, ailleurs que sur la plupart des autres écrans.`, visibility: "page" }] });
    }
  }
}
