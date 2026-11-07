/**
 * Explications concrètes par règle axe-core, pour le rapport HTML :
 * le problème en langage clair, ce qu'il faut faire, pourquoi (qui est gêné),
 * et quand c'est possible une proposition de code corrigé à partir du code actuel.
 */
import type { Occurrence } from "./analyze.js";

export interface RuleFix {
  /** Le problème, en une phrase compréhensible par tous. */
  problem: string;
  /** Ce qu'il faut faire. */
  fix: string;
  /** Pourquoi : qui est gêné et comment. */
  why: string;
  /** Propose une version corrigée du code de l'élément. */
  suggest?: (o: Occurrence) => string | undefined;
}

// ---------------------------------------------------------------------------
// Outils de réécriture du code HTML
// ---------------------------------------------------------------------------

const OPEN_TAG = /^<([a-zA-Z][\w-]*)([^>]*?)(\/?)>/;

/** Ajoute (ou remplace) un attribut dans la balise ouvrante. */
export function setAttr(html: string, name: string, value: string): string {
  const m = OPEN_TAG.exec(html);
  if (!m) return html;
  const attrRe = new RegExp(`\\s${name}(=("[^"]*"|'[^']*'|[^\\s>]*))?`, "i");
  const attrs = attrRe.test(m[2]) ? m[2].replace(attrRe, ` ${name}="${value}"`) : `${m[2]} ${name}="${value}"`;
  return `<${m[1]}${attrs}${m[3]}>${html.slice(m[0].length)}`;
}

/** Retire un attribut de la balise ouvrante. */
export function removeAttr(html: string, name: string): string {
  const m = OPEN_TAG.exec(html);
  if (!m) return html;
  const attrs = m[2].replace(new RegExp(`\\s${name}(=("[^"]*"|'[^']*'|[^\\s>]*))?`, "gi"), "");
  return `<${m[1]}${attrs}${m[3]}>${html.slice(m[0].length)}`;
}

function attr(html: string, name: string): string | undefined {
  const m = OPEN_TAG.exec(html);
  if (!m) return undefined;
  const a = new RegExp(`\\s${name}=("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(m[2]);
  return a ? (a[2] ?? a[3] ?? a[4]) : undefined;
}

function tag(html: string): string | undefined {
  return OPEN_TAG.exec(html)?.[1].toLowerCase();
}

/** Remplace le contenu d'un élément simple (ex. lien vide). */
function setContent(html: string, content: string): string {
  const m = OPEN_TAG.exec(html);
  if (!m || m[3]) return html;
  const close = `</${m[1]}>`;
  const end = html.lastIndexOf(close);
  if (end < 0) return `${m[0]}${content}${close}`;
  return html.slice(m[0].length, end).trim() ? html : `${m[0]}${content}${close}`;
}

/** Ajoute aria-hidden="true" aux <svg> et icônes internes. */
function hideInnerIcons(html: string): string {
  return html.replace(/<svg(?![^>]*aria-hidden)/gi, '<svg aria-hidden="true" focusable="false"').replace(/<i(\s[^>]*class="[^"]*icon[^"]*")(?![^>]*aria-hidden)/gi, '<i aria-hidden="true"$1');
}

// ---------------------------------------------------------------------------
// Contraste
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance([r, g, b]: number[]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number | undefined {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return undefined;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Couleur de texte la plus proche de l'originale qui atteint le ratio demandé
 * sur le fond donné (en assombrissant ou en éclaircissant).
 */
export function closestCompliantColor(fg: string, bg: string, target: number): string | undefined {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return undefined;
  const candidates: string[] = [];
  for (const towards of [[0, 0, 0], [255, 255, 255]]) {
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const c = toHex(f.map((v, i) => v + (towards[i] - v) * t));
      if ((contrastRatio(c, bg) ?? 0) >= target + 0.05) {
        candidates.push(c);
        break;
      }
    }
  }
  const dist = (c: string) => parseHex(c)!.reduce((s, v, i) => s + (v - f[i]) ** 2, 0);
  return candidates.sort((x, y) => dist(x) - dist(y))[0];
}

/** Décrit les couleurs mesurées par axe et propose une couleur conforme. */
export function contrastDetails(o: Occurrence): { current: string; proposal?: string; fg?: string; bg?: string; fixedFg?: string } | undefined {
  const d = o.data as { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string; fontSize?: string; fontWeight?: string } | undefined;
  if (!d?.fgColor || !d.bgColor) return undefined;
  const expected = parseFloat(String(d.expectedContrastRatio ?? "4.5"));
  const ratio = typeof d.contrastRatio === "number" ? d.contrastRatio : contrastRatio(d.fgColor, d.bgColor);
  const fixedFg = closestCompliantColor(d.fgColor, d.bgColor, expected);
  const current = `Texte ${d.fgColor} sur fond ${d.bgColor} : contraste de ${ratio?.toFixed(2)}:1 pour ${expected}:1 attendu${d.fontSize ? ` (texte de ${d.fontSize}${d.fontWeight === "bold" ? ", gras" : ""})` : ""}.`;
  const proposal = fixedFg ? `Passer la couleur du texte de ${d.fgColor} à ${fixedFg} (contraste ${contrastRatio(fixedFg, d.bgColor)!.toFixed(2)}:1), ou modifier le fond.` : undefined;
  return { current, proposal, fg: d.fgColor, bg: d.bgColor, fixedFg };
}

// ---------------------------------------------------------------------------
// Explications par règle
// ---------------------------------------------------------------------------

const WHY_SR_IMAGE = "Une personne aveugle utilise un lecteur d'écran qui lit le texte de la page à voix haute. Sans texte de remplacement, l'image est annoncée par son nom de fichier ou ignorée : l'information qu'elle porte est perdue.";
const WHY_NAME = "Les lecteurs d'écran et la commande vocale (« cliquer sur Envoyer ») s'appuient sur le nom accessible d'un élément. Sans nom, l'utilisateur entend seulement « bouton » ou « lien » sans savoir ce qu'il fait, et ne peut pas l'activer à la voix.";
const WHY_ARIA = "Les attributs ARIA modifient ce que les technologies d'assistance annoncent. Mal utilisés, ils annoncent un rôle ou un état faux, ou masquent un élément : l'interface devient trompeuse ou inutilisable au lecteur d'écran.";
const WHY_STRUCTURE = "Les utilisateurs de lecteur d'écran naviguent par titres, listes et régions (touches H, L, D…) pour se repérer et sauter directement à ce qui les intéresse. Une structure absente ou incohérente les oblige à tout écouter dans l'ordre.";

const PLACEHOLDER_ALT = "[information transmise par l'image]";

export const ruleFixes: Record<string, RuleFix> = {
  "image-alt": {
    problem: "L'image n'a pas d'attribut alt : un lecteur d'écran ne sait pas ce qu'elle représente.",
    fix: "Ajouter un attribut alt. Si l'image porte une information (logo, schéma, bouton), alt décrit cette information en quelques mots. Si elle est purement décorative, alt=\"\" (vide) pour qu'elle soit ignorée.",
    why: WHY_SR_IMAGE,
    suggest: (o) => setAttr(o.fullHtml, "alt", PLACEHOLDER_ALT),
  },
  "input-image-alt": {
    problem: "Le bouton image (<input type=\"image\">) n'a pas de texte de remplacement : on ne sait pas quelle action il déclenche.",
    fix: "Ajouter un attribut alt qui décrit l'action (ex. alt=\"Rechercher\").",
    why: WHY_NAME,
    suggest: (o) => setAttr(o.fullHtml, "alt", "[action du bouton]"),
  },
  "area-alt": {
    problem: "Une zone cliquable d'image réactive (<area>) n'a pas de texte de remplacement.",
    fix: "Ajouter alt sur chaque <area>, décrivant la destination du lien.",
    why: WHY_SR_IMAGE,
    suggest: (o) => setAttr(o.fullHtml, "alt", "[destination du lien]"),
  },
  "role-img-alt": {
    problem: "L'élément a role=\"img\" mais aucun texte de remplacement.",
    fix: "Ajouter aria-label=\"…\" décrivant l'information, ou retirer role=\"img\" et ajouter aria-hidden=\"true\" s'il est décoratif.",
    why: WHY_SR_IMAGE,
    suggest: (o) => setAttr(o.fullHtml, "aria-label", PLACEHOLDER_ALT),
  },
  "svg-img-alt": {
    problem: "Le SVG est déclaré comme image (role=\"img\") mais n'a pas de texte de remplacement.",
    fix: "Ajouter aria-label=\"…\" sur le <svg> (ou un <title> relié par aria-labelledby). S'il est décoratif : aria-hidden=\"true\" sans role=\"img\".",
    why: WHY_SR_IMAGE,
    suggest: (o) => setAttr(o.fullHtml, "aria-label", PLACEHOLDER_ALT),
  },
  "image-redundant-alt": {
    problem: "Le texte de remplacement de l'image répète le texte qui l'entoure : il est lu deux fois.",
    fix: "Mettre alt=\"\" si le texte voisin suffit, ou rédiger une alternative qui apporte une autre information.",
    why: "Le lecteur d'écran annonce deux fois la même chose, ce qui alourdit l'écoute et fait douter l'utilisateur d'avoir bien compris.",
    suggest: (o) => setAttr(o.fullHtml, "alt", ""),
  },
  "frame-title": {
    problem: "Le cadre (<iframe>) n'a pas de titre : on ne sait pas ce qu'il contient avant d'y entrer.",
    fix: "Ajouter title=\"…\" décrivant le contenu du cadre (ex. title=\"Carte d'accès au bâtiment\").",
    why: "Les lecteurs d'écran listent les cadres par leur titre. Sans titre, l'utilisateur doit entrer dans chaque cadre pour deviner son contenu.",
    suggest: (o) => setAttr(o.fullHtml, "title", "[contenu du cadre]"),
  },
  "color-contrast": {
    problem: "Le texte n'est pas assez contrasté par rapport à son fond.",
    fix: "Foncer (ou éclaircir) la couleur du texte ou du fond pour atteindre au moins 4,5:1 (3:1 pour un texte de 24 px, ou 18,5 px en gras). Corriger de préférence la couleur dans le design system pour régler tous les cas d'un coup.",
    why: "Une personne malvoyante, âgée, daltonienne, ou n'importe qui sur un écran au soleil, ne peut pas lire un texte peu contrasté. C'est l'un des problèmes les plus fréquents et les plus gênants au quotidien.",
  },
  "link-in-text-block": {
    problem: "Le lien dans le paragraphe ne se distingue du texte que par sa couleur.",
    fix: "Souligner le lien (text-decoration: underline), ou assurer un contraste de 3:1 avec le texte autour ET un indice non coloré au survol et au focus.",
    why: "Une personne daltonienne ou malvoyante ne voit pas la différence de couleur : elle ne sait pas que le texte est cliquable.",
  },
  "link-name": {
    problem: "Le lien n'a pas d'intitulé : il est vide ou ne contient qu'une image ou une icône sans texte.",
    fix: "Donner au lien un texte visible qui indique sa destination. Pour un lien-icône : aria-label=\"…\" sur le lien (ou alt sur l'image) et aria-hidden=\"true\" sur l'icône.",
    why: WHY_NAME,
    suggest: (o) => {
      const h = o.fullHtml;
      if (/<(svg|img|i)\b/i.test(h)) return hideInnerIcons(setAttr(h, "aria-label", "[destination du lien]"));
      return setContent(h, "[destination du lien]");
    },
  },
  "label-content-name-mismatch": {
    problem: "Le nom accessible (aria-label) ne reprend pas le texte visible de l'élément.",
    fix: "Faire commencer le nom accessible par le texte visible (ex. texte « Envoyer », aria-label=\"Envoyer le formulaire\"), ou retirer l'aria-label.",
    why: "Un utilisateur de commande vocale dit ce qu'il voit (« cliquer sur Envoyer ») : si le nom accessible est différent, la commande échoue.",
  },
  "button-name": {
    problem: "Le bouton n'a pas d'intitulé : il est vide ou ne contient qu'une icône.",
    fix: "Mettre un texte dans le bouton ou, pour un bouton-icône, aria-label=\"…\" décrivant l'action, et aria-hidden=\"true\" sur l'icône.",
    why: WHY_NAME,
    suggest: (o) => {
      const h = o.fullHtml;
      if (/<(svg|img|i)\b/i.test(h)) return hideInnerIcons(setAttr(h, "aria-label", "[action du bouton]"));
      return setContent(h, "[action du bouton]");
    },
  },
  "input-button-name": {
    problem: "Le bouton (<input type=\"button|submit|reset\">) n'a pas d'intitulé.",
    fix: "Ajouter value=\"…\" décrivant l'action.",
    why: WHY_NAME,
    suggest: (o) => setAttr(o.fullHtml, "value", "[action du bouton]"),
  },
  label: {
    problem: "Le champ de formulaire n'a pas d'étiquette associée : on ne sait pas quoi saisir.",
    fix: "Ajouter une balise <label for=\"…\"> visible, reliée au champ par son id. Un placeholder ou un title ne suffisent pas. Ajouter aussi autocomplete si le champ concerne l'utilisateur (e-mail, nom, adresse…).",
    why: "Le lecteur d'écran annonce « zone d'édition » sans dire laquelle. Les personnes avec des troubles cognitifs perdent le placeholder dès qu'elles commencent à taper. L'étiquette cliquable agrandit aussi la zone d'activation.",
    suggest: (o) => {
      const h = o.fullHtml;
      const id = attr(h, "id") ?? "champ";
      const withId = attr(h, "id") ? h : setAttr(h, "id", id);
      const type = attr(h, "type");
      const auto: Record<string, string> = { email: "email", tel: "tel", password: "current-password" };
      const fixed = type && auto[type] && !attr(h, "autocomplete") ? setAttr(withId, "autocomplete", auto[type]) : withId;
      return `<label for="${id}">[Intitulé du champ]</label>\n${fixed}`;
    },
  },
  "select-name": {
    problem: "La liste déroulante n'a pas d'étiquette associée.",
    fix: "Ajouter un <label for=\"…\"> visible relié à l'id du <select>.",
    why: "Le lecteur d'écran annonce « liste déroulante » sans dire à quoi elle sert.",
    suggest: (o) => {
      const id = attr(o.fullHtml, "id") ?? "liste";
      return `<label for="${id}">[Intitulé de la liste]</label>\n${attr(o.fullHtml, "id") ? o.fullHtml : setAttr(o.fullHtml, "id", id)}`;
    },
  },
  "form-field-multiple-labels": {
    problem: "Le champ a plusieurs étiquettes : les technologies d'assistance n'en lisent qu'une, de façon imprévisible.",
    fix: "Garder une seule <label> ; déplacer les informations complémentaires dans un texte relié par aria-describedby.",
    why: "Selon le lecteur d'écran, l'utilisateur n'entend qu'une partie de l'intitulé.",
  },
  "label-title-only": {
    problem: "Le champ n'est étiqueté que par son attribut title (une info-bulle).",
    fix: "Ajouter une <label> visible ; garder title seulement en complément.",
    why: "L'info-bulle n'apparaît qu'à la souris : au clavier, sur mobile ou avec certaines aides techniques, l'intitulé est invisible.",
  },
  "autocomplete-valid": {
    problem: "La valeur de l'attribut autocomplete n'est pas reconnue.",
    fix: "Utiliser une valeur de la liste HTML (name, email, tel, street-address, postal-code, bday…).",
    why: "Le remplissage automatique évite de ressaisir ses données : essentiel pour les personnes avec des troubles moteurs, cognitifs ou de mémoire.",
  },
  "html-has-lang": {
    problem: "La langue de la page n'est pas indiquée.",
    fix: "Ajouter lang=\"fr\" sur la balise <html>.",
    why: "Le lecteur d'écran choisit sa voix et sa prononciation selon la langue déclarée. Sans elle, un texte français peut être lu avec un accent anglais incompréhensible.",
    suggest: () => '<html lang="fr">',
  },
  "html-lang-valid": {
    problem: "Le code de langue de la page n'est pas valide.",
    fix: "Utiliser un code de langue valide (fr, en, fr-FR…).",
    why: "Le lecteur d'écran ne reconnaît pas la langue et peut prononcer le texte de travers.",
    suggest: () => '<html lang="fr">',
  },
  "valid-lang": {
    problem: "Un changement de langue est déclaré avec un code invalide.",
    fix: "Corriger l'attribut lang (ex. lang=\"en\" pour un passage en anglais).",
    why: "Le passage en langue étrangère est lu avec la mauvaise prononciation.",
  },
  "document-title": {
    problem: "La page n'a pas de titre (<title>).",
    fix: "Ajouter dans <head> un <title> unique et explicite, sous la forme « Nom de la page – Nom du site ».",
    why: "Le titre est la première chose annoncée par le lecteur d'écran et ce qui permet de distinguer les onglets ouverts. Sans lui, on ne sait pas où l'on est.",
    suggest: () => "<title>[Nom de la page] – [Nom du site]</title>",
  },
  "duplicate-id-aria": {
    problem: "Un id utilisé par ARIA ou une étiquette existe plusieurs fois dans la page.",
    fix: "Rendre chaque id unique (attention aux composants répétés : générer l'id).",
    why: "L'étiquette ou la description reliée par cet id peut être lue sur le mauvais élément.",
  },
  "empty-heading": {
    problem: "Le titre (<h1>…<h6>) est vide.",
    fix: "Donner un texte au titre, ou supprimer la balise si ce n'est pas un titre.",
    why: WHY_STRUCTURE,
  },
  "heading-order": {
    problem: "Un niveau de titre est sauté (ex. un <h4> directement après un <h2>).",
    fix: "Utiliser des niveaux qui se suivent (h2 puis h3…) ; régler la taille visuelle en CSS, pas avec le niveau de titre.",
    why: WHY_STRUCTURE,
  },
  "page-has-heading-one": {
    problem: "La page n'a pas de titre principal <h1>.",
    fix: "Ajouter un <h1> qui décrit le contenu principal de la page.",
    why: WHY_STRUCTURE,
  },
  list: {
    problem: "La liste (<ul> ou <ol>) contient autre chose que des <li>.",
    fix: "Ne mettre que des <li> (ou <script>/<template>) directement dans <ul>/<ol>.",
    why: "Le lecteur d'écran annonce « liste de N éléments » : une liste mal formée donne un nombre faux ou n'est pas reconnue.",
  },
  listitem: {
    problem: "L'élément <li> n'est pas dans une liste <ul> ou <ol>.",
    fix: "Placer les <li> dans un <ul> ou un <ol>.",
    why: "Le lecteur d'écran ne reconnaît pas la liste ni le nombre d'éléments.",
  },
  "landmark-one-main": {
    problem: "La page n'a pas de zone de contenu principal (<main>).",
    fix: "Envelopper le contenu principal dans une balise <main> (une seule par page).",
    why: WHY_STRUCTURE,
  },
  region: {
    problem: "Du contenu se trouve en dehors de toute région de la page (<header>, <nav>, <main>, <footer>).",
    fix: "Placer tout le contenu dans les régions HTML adaptées.",
    why: WHY_STRUCTURE,
  },
  bypass: {
    problem: "Aucun moyen de passer directement au contenu principal.",
    fix: "Ajouter en tout début de page un lien « Aller au contenu » vers <main id=\"contenu\">, visible au moins au focus.",
    why: "Sans lien d'évitement, une personne qui navigue au clavier doit traverser tout le menu à chaque page.",
  },
  tabindex: {
    problem: "Un tabindex supérieur à 0 modifie l'ordre de tabulation.",
    fix: "Utiliser tabindex=\"0\" (ou rien) et ordonner les éléments dans le code source.",
    why: "L'ordre de tabulation devient imprévisible pour une personne qui navigue au clavier : le focus saute d'un endroit à l'autre de la page.",
    suggest: (o) => setAttr(o.fullHtml, "tabindex", "0"),
  },
  "scrollable-region-focusable": {
    problem: "Une zone qui défile ne peut pas recevoir le focus au clavier.",
    fix: "Ajouter tabindex=\"0\" et un nom (aria-label) à la zone défilante, ou y placer un élément focalisable.",
    why: "Sans souris, impossible de faire défiler la zone : son contenu caché reste inaccessible.",
    suggest: (o) => setAttr(setAttr(o.fullHtml, "tabindex", "0"), "aria-label", "[nom de la zone]"),
  },
  "aria-hidden-focus": {
    problem: "Un élément masqué aux technologies d'assistance (aria-hidden=\"true\") contient un élément qui reçoit le focus.",
    fix: "Retirer aria-hidden, ou rendre les éléments internes non focalisables (tabindex=\"-1\", inert, ou masquer le bloc en CSS).",
    why: "Le focus clavier arrive sur un élément que le lecteur d'écran n'annonce pas : l'utilisateur est « perdu dans le vide ».",
  },
  "nested-interactive": {
    problem: "Un élément interactif contient un autre élément interactif (ex. un bouton dans un lien).",
    fix: "Séparer les deux éléments ; un lien ou un bouton ne doit contenir que du texte ou des images.",
    why: "Le lecteur d'écran n'annonce que l'élément extérieur : l'élément intérieur devient inaccessible.",
  },
  "aria-valid-attr-value": {
    problem: "Un attribut ARIA a une valeur invalide (ex. aria-expanded=\"oui\", id inexistant dans aria-labelledby).",
    fix: "Corriger la valeur (true/false, id existant…) selon la spécification ARIA.",
    why: WHY_ARIA,
  },
  "aria-valid-attr": { problem: "Un attribut aria-* n'existe pas (faute de frappe ?).", fix: "Corriger le nom de l'attribut ou le supprimer.", why: WHY_ARIA },
  "aria-allowed-attr": { problem: "Un attribut ARIA n'est pas autorisé sur ce rôle d'élément.", fix: "Retirer l'attribut ou utiliser le rôle adapté.", why: WHY_ARIA },
  "aria-required-attr": { problem: "Il manque un attribut ARIA obligatoire pour ce rôle (ex. aria-checked sur role=\"checkbox\").", fix: "Ajouter l'attribut requis et le tenir à jour en JavaScript, ou utiliser l'élément HTML natif.", why: WHY_ARIA },
  "aria-roles": { problem: "La valeur de role n'est pas un rôle ARIA valide.", fix: "Corriger le rôle ou le supprimer ; préférer l'élément HTML natif (<button>, <nav>…).", why: WHY_ARIA },
  "aria-required-children": { problem: "Ce rôle ARIA exige des éléments enfants précis (ex. role=\"list\" → role=\"listitem\").", fix: "Ajouter les rôles enfants attendus, ou utiliser les éléments HTML natifs.", why: WHY_ARIA },
  "aria-required-parent": { problem: "Ce rôle ARIA doit être placé dans un parent précis (ex. role=\"tab\" dans role=\"tablist\").", fix: "Ajouter le parent attendu.", why: WHY_ARIA },
  "aria-prohibited-attr": { problem: "aria-label ou aria-labelledby est interdit sur cet élément (ex. un <div> ou <span> sans rôle).", fix: "Mettre le texte en clair dans la page, ou donner un rôle adapté à l'élément.", why: WHY_ARIA },
  "aria-input-field-name": { problem: "Le champ ARIA (role=\"combobox\", \"textbox\"…) n'a pas de nom.", fix: "Ajouter aria-label ou aria-labelledby.", why: WHY_NAME },
  "aria-toggle-field-name": { problem: "L'interrupteur ARIA (case, switch…) n'a pas de nom.", fix: "Ajouter un texte, aria-label ou aria-labelledby.", why: WHY_NAME },
  "aria-command-name": { problem: "L'élément de commande ARIA (role=\"button\", \"link\", \"menuitem\") n'a pas de nom.", fix: "Ajouter un texte, aria-label ou aria-labelledby.", why: WHY_NAME },
  "aria-dialog-name": { problem: "La fenêtre modale n'a pas de titre accessible.", fix: "Relier le titre de la modale par aria-labelledby.", why: "À l'ouverture, le lecteur d'écran annonce « boîte de dialogue » sans dire laquelle." },
  "aria-hidden-body": { problem: "Toute la page est masquée aux technologies d'assistance (aria-hidden sur <body>).", fix: "Retirer aria-hidden=\"true\" du <body>.", why: "Le lecteur d'écran ne lit plus rien : la page est entièrement inaccessible." },
  "meta-viewport": {
    problem: "La page empêche le zoom sur mobile (user-scalable=no ou maximum-scale trop bas).",
    fix: "Retirer user-scalable=no et maximum-scale de la balise <meta name=\"viewport\">.",
    why: "Les personnes malvoyantes zooment pour lire. Bloquer le zoom les empêche d'utiliser le site sur mobile.",
    suggest: () => '<meta name="viewport" content="width=device-width, initial-scale=1">',
  },
  "meta-refresh": {
    problem: "La page se recharge ou redirige automatiquement après un délai.",
    fix: "Supprimer le rafraîchissement automatique, ou laisser l'utilisateur le déclencher ou l'arrêter.",
    why: "Une personne qui lit lentement ou utilise un lecteur d'écran perd sa position et n'a pas le temps de lire.",
  },
  "td-headers-attr": { problem: "Une cellule du tableau référence des en-têtes qui n'existent pas.", fix: "Corriger l'attribut headers pour qu'il cite les id des <th> du même tableau.", why: "Le lecteur d'écran annonce l'en-tête de chaque cellule ; des liens faux donnent des données incompréhensibles." },
  "th-has-data-cells": { problem: "Un en-tête de tableau ne correspond à aucune cellule de données.", fix: "Vérifier la structure du tableau (colspan, scope) ou retirer l'en-tête inutile.", why: "Les cellules ne sont pas associées au bon en-tête lors de la lecture vocale." },
  "target-size": {
    problem: "La zone cliquable est trop petite ou trop proche d'une autre.",
    fix: "Donner au moins 24 × 24 px à la cible (padding, min-width/min-height) ou l'espacer des cibles voisines.",
    why: "Les personnes avec des tremblements, une motricité réduite, ou simplement sur mobile avec le pouce, cliquent à côté.",
  },

  // -------------------------------------------------------------------------
  // Tests complémentaires access4all (navigateur piloté au clavier, zoom, reflow…)
  // -------------------------------------------------------------------------
  "a4a-focus-invisible": {
    problem: "Quand cet élément reçoit le focus au clavier, rien ne change à l'écran : on ne sait pas où l'on se trouve.",
    fix: "Ne jamais retirer le contour de focus sans le remplacer. Ajouter un style :focus-visible bien contrasté (contour d'au moins 2 px).",
    why: "Les personnes qui naviguent au clavier (handicap moteur, malvoyance, utilisateurs avancés) suivent le focus pour savoir où elles sont ; sans lui, elles sont perdues.",
    suggest: (o) => `${o.selector}:focus-visible {\n  outline: 3px solid #0a58ca;\n  outline-offset: 2px;\n}`,
  },
  "a4a-focus-element-cache": {
    problem: "Le focus clavier arrive sur un élément invisible (lien d'un menu fermé, élément hors écran ou masqué en opacité).",
    fix: "Retirer l'élément du parcours clavier quand il est masqué : display:none, visibility:hidden, attribut hidden ou inert sur le conteneur fermé. Le rendre visible s'il doit rester atteignable (lien d'évitement : l'afficher au focus).",
    why: "La personne au clavier appuie sur Tab sans rien voir bouger : elle croit le site bloqué ou perd sa position.",
  },
  "a4a-focus-masque": {
    problem: "L'élément qui reçoit le focus est entièrement caché derrière un élément fixe (en-tête collant, bandeau cookies, bouton flottant).",
    fix: "Ajouter scroll-padding-top (et scroll-padding-bottom) égal à la hauteur de l'en-tête ou du bandeau fixe, ou ne plus le fixer.",
    why: "Au clavier, la page défile jusqu'à l'élément mais il reste sous l'en-tête : la personne ne voit pas où elle est.",
    suggest: () => "html {\n  scroll-padding-top: [hauteur de l'en-tête fixe, ex. 96px];\n}",
  },
  "a4a-piege-clavier": {
    problem: "La touche Tab tourne en rond dans une partie de la page : impossible d'en sortir au clavier.",
    fix: "Ne retenir le focus que dans une fenêtre modale ouverte, avec un bouton et la touche Échap pour la fermer. Ailleurs, ne pas intercepter Tab.",
    why: "Une personne qui ne peut pas utiliser de souris est bloquée : la suite du site lui est inaccessible.",
  },
  "a4a-ordre-tabulation": {
    problem: "Le focus remonte nettement dans la page en tabulant : l'ordre clavier ne suit peut-être pas l'ordre de lecture.",
    fix: "Vérifier l'ordre en tabulant. S'il est illogique, réordonner le code HTML plutôt que d'utiliser CSS order ou un tabindex positif.",
    why: "Les personnes au clavier ou au lecteur d'écran découvrent la page dans l'ordre du code ; un ordre incohérent la rend difficile à comprendre.",
  },
  "a4a-changement-contexte-focus": {
    problem: "Le simple fait de tabuler sur cet élément change de page, sans clic ni validation.",
    fix: "Ne déclencher la navigation qu'à l'activation (clic, Entrée), jamais sur focus ou change.",
    why: "Les personnes au clavier ou au lecteur d'écran sont emmenées ailleurs sans l'avoir voulu et perdent le fil.",
  },
  "a4a-reflow": {
    problem: "À 320 px de large (zoom à 400 % ou petit téléphone), cet élément dépasse de l'écran : contenu coupé ou défilement horizontal.",
    fix: "Supprimer les largeurs fixes en px (width, min-width), utiliser max-width:100%, flex-wrap, des grilles fluides et des media queries.",
    why: "Les personnes malvoyantes zooment fortement ; si elles doivent défiler dans les deux sens pour lire chaque ligne, la lecture devient épuisante, voire impossible.",
  },
  "a4a-zoom-texte-coupe": {
    problem: "Avec un zoom à 200 %, le texte de cet élément est coupé.",
    fix: "Éviter les hauteurs fixes sur les conteneurs de texte (height en px avec overflow:hidden) : utiliser min-height et des unités relatives (rem, em).",
    why: "Les personnes malvoyantes agrandissent le texte ; s'il est tronqué, elles perdent l'information.",
  },
  "a4a-espacement-texte": {
    problem: "Quand on augmente l'interligne et l'espacement des lettres et des mots, le texte de cet élément est coupé.",
    fix: "Laisser les conteneurs de texte grandir : pas de height fixe avec overflow:hidden, préférer min-height et padding.",
    why: "Les personnes dyslexiques ou malvoyantes augmentent l'espacement du texte (extension, feuille de styles) pour pouvoir lire.",
  },
  "a4a-orientation": {
    problem: "Une partie du contenu disparaît quand on tourne l'écran (portrait ou paysage).",
    fix: "Ne pas masquer ni bloquer de contenu selon l'orientation (media query orientation) ; adapter la mise en page aux deux.",
    why: "Certaines personnes ont leur tablette ou leur téléphone fixé dans une orientation (fauteuil roulant, support) et ne peuvent pas le tourner.",
  },
  "a4a-survol-seul": {
    problem: "Un contenu (sous-menu, infobulle) ne s'affiche qu'au survol de la souris.",
    fix: "Ajouter la même règle avec :focus-within (ou :focus) pour que le contenu s'affiche aussi au clavier.",
    why: "Les personnes qui naviguent au clavier ou avec une commande vocale n'ont pas de survol : le contenu leur reste caché.",
    suggest: (o) => {
      const sel = o.data?.selector;
      return typeof sel === "string" ? `${sel},\n${sel.replace(/:hover/g, ":focus-within")} {\n  /* mêmes déclarations que la règle :hover */\n}` : undefined;
    },
  },
  "a4a-infobulle-non-masquable": {
    problem: "L'infobulle reste affichée après un appui sur Échap.",
    fix: "Fermer l'infobulle sur Échap (écouteur keydown) sans déplacer le focus.",
    why: "Une infobulle qui recouvre le contenu gêne les personnes qui zooment : elles doivent pouvoir la fermer sans bouger la souris.",
  },
  "a4a-clic-non-focusable": {
    problem: "Cet élément réagit au clic mais ne peut pas recevoir le focus clavier.",
    fix: "Utiliser un vrai <button> (action) ou <a href> (navigation). À défaut : tabindex=\"0\", un role adapté et la gestion des touches Entrée et Espace.",
    why: "Les personnes qui n'utilisent pas de souris ne peuvent pas atteindre ni activer cette fonction.",
    suggest: (o) => {
      const m = /^<([a-z][\w-]*)([^>]*)>([\s\S]*)<\/\1>$/i.exec(o.fullHtml);
      if (!m) return undefined;
      const attrs = m[2].replace(/\s(role|tabindex)=("[^"]*"|'[^']*')/gi, "");
      return `<button type="button"${attrs}>${m[3]}</button>`;
    },
  },
  "a4a-select-onchange": {
    problem: "Changer d'option dans cette liste déroulante déclenche peut-être une action immédiate (envoi, changement de page).",
    fix: "Ajouter un bouton de validation après la liste, ou prévenir l'utilisateur avant la liste.",
    why: "Au clavier, chaque flèche change l'option : la personne est emmenée ailleurs avant d'avoir fait son choix.",
  },
  "a4a-statut-absent": {
    problem: "La page a un formulaire mais aucune zone de message de statut (role=\"status\", role=\"alert\", aria-live).",
    fix: "Afficher les messages de confirmation, d'erreur ou de résultats dans un conteneur role=\"status\" (ou role=\"alert\" pour les erreurs) présent dès le chargement.",
    why: "Sans zone de statut, le lecteur d'écran n'annonce pas « Message envoyé » ou « 3 erreurs » : la personne ne sait pas ce qui s'est passé.",
    suggest: () => '<div role="status" class="message-statut"><!-- message inséré ici après l\'envoi --></div>',
  },
  "a4a-id-duplique": {
    problem: "Le même identifiant (id) est utilisé sur plusieurs éléments.",
    fix: "Rendre chaque id unique dans la page (composants répétés : générer un suffixe).",
    why: "Les étiquettes (for), aria-labelledby et aria-describedby visent le premier élément trouvé : les autres champs perdent leur nom pour le lecteur d'écran.",
  },
  "a4a-titre-page-generique": {
    problem: "Le titre de la page (onglet) est générique et ne dit pas où l'on est.",
    fix: "Donner un titre unique de la forme « Sujet de la page – Nom du site ».",
    why: "C'est la première chose annoncée par le lecteur d'écran et ce qui permet de distinguer les onglets.",
  },
  "a4a-titre-page-duplique": {
    problem: "Plusieurs écrans ont exactement le même titre de page.",
    fix: "Donner à chaque écran un titre qui le distingue : « Contact – Nom du site », « Panier – Nom du site »…",
    why: "La personne aveugle ne sait pas si la page a changé, ni sur quel écran elle se trouve.",
  },
  "a4a-balise-presentation": {
    problem: "Des balises HTML servent uniquement à créer de l'espace (paragraphes vides, sauts de ligne successifs).",
    fix: "Supprimer les paragraphes vides et <br> successifs ; gérer l'espacement avec margin ou padding en CSS.",
    why: "Le lecteur d'écran annonce ces éléments vides (« vide », « ligne vide ») et la structure du texte devient confuse.",
  },
  "a4a-faux-titre": {
    problem: "Ce texte a l'apparence d'un titre (grand et gras) mais n'est pas balisé comme un titre.",
    fix: "S'il introduit une section, le baliser en <h2>, <h3>… selon le niveau ; sinon, ignorer.",
    why: "Les personnes aveugles naviguent de titre en titre ; un titre seulement visuel leur est invisible.",
    suggest: (o) => {
      const m = /^<([a-z][\w-]*)([^>]*)>([\s\S]*)<\/\1>$/i.exec(o.fullHtml);
      return m ? `<h2${m[2]}>${m[3]}</h2>` : undefined;
    },
  },
  "a4a-zones-manquantes": {
    problem: "Certaines zones de la page (en-tête, navigation, contenu principal, pied de page) ne sont pas identifiées.",
    fix: "Utiliser les balises <header>, <nav>, <main> et <footer> (une seule zone main) pour les zones correspondantes.",
    why: "Les lecteurs d'écran proposent d'aller directement à ces zones ; sans elles, il faut tout parcourir.",
  },
  "a4a-attribut-presentation": {
    problem: "La présentation est définie dans le HTML (balise ou attribut de présentation) au lieu des CSS.",
    fix: "Retirer ces balises ou attributs et reporter la mise en forme dans la feuille de styles.",
    why: "Les personnes qui adaptent l'affichage (couleurs, taille, espacements) ne peuvent pas modifier une présentation figée dans le HTML.",
    suggest: (o) => {
      const attrs = o.data?.attrs;
      if (!Array.isArray(attrs) || !attrs.length) return undefined;
      return attrs.reduce<string>((h, a) => removeAttr(h, String(a)), o.fullHtml);
    },
  },
  "a4a-contenu-css": {
    problem: "Un texte ou une icône est générée en CSS (::before ou ::after) : l'information disparaît sans les styles.",
    fix: "Mettre l'information dans le HTML ; garder le CSS pour la décoration, et masquer les icônes décoratives.",
    why: "Sans CSS ou avec certains lecteurs d'écran, ce contenu n'existe pas.",
  },
  "a4a-ordre-css": {
    problem: "L'ordre d'affichage est modifié en CSS : sans styles, au clavier et au lecteur d'écran, l'ordre est différent.",
    fix: "Ordonner le code HTML dans l'ordre de lecture voulu ; n'utiliser order ou *-reverse que si le sens reste compréhensible dans l'ordre du code.",
    why: "Le lecteur d'écran et le clavier suivent le code, pas l'affichage : l'information peut devenir incohérente.",
  },
  "a4a-couleurs-css": {
    problem: "La couleur du texte est déclarée mais pas la couleur de fond de la page.",
    fix: "Déclarer background-color sur html ou body (et sur chaque bloc qui change la couleur du texte).",
    why: "Une personne qui a choisi un fond sombre par défaut verra un texte foncé sur fond sombre, illisible.",
    suggest: () => "body {\n  background-color: #fff; /* ou la couleur de fond du site */\n}",
  },
  "a4a-forme-position": {
    problem: "Le texte désigne un élément par sa position, sa forme ou sa couleur.",
    fix: "Désigner aussi l'élément par son nom ou son texte (« le bouton Envoyer » plutôt que « le bouton vert à droite »).",
    why: "Une personne aveugle ou qui zoome ne perçoit ni la position, ni la forme, ni la couleur.",
  },
  "a4a-groupe-sans-fieldset": {
    problem: "Ces boutons radio ou cases à cocher répondent à la même question mais ne sont pas regroupés.",
    fix: "Les entourer d'un <fieldset> avec une <legend> qui pose la question.",
    why: "Le lecteur d'écran annonce « Oui », « Non » sans la question : la personne ne sait pas à quoi elle répond.",
    suggest: (o) => `<fieldset>\n  <legend>[Question posée par ce groupe]</legend>\n  ${o.fullHtml}\n</fieldset>`,
  },
  "a4a-groupe-sans-legende": {
    problem: "Ce regroupement de champs n'a pas de légende.",
    fix: "Ajouter une <legend> en premier enfant du <fieldset> (ou aria-labelledby sur le role=\"group\").",
    why: "Le lecteur d'écran annonce le groupe sans dire de quoi il s'agit.",
  },
  "a4a-bouton-generique": {
    problem: "L'intitulé du bouton ne dit peut-être pas clairement ce qu'il fait.",
    fix: "Utiliser un verbe d'action précis : « Envoyer ma demande », « Ajouter au panier », « Rechercher ».",
    why: "Hors contexte (liste des boutons du lecteur d'écran), « OK » ou « Valider » ne dit rien de l'action.",
  },
  "a4a-bouton-nom-visible": {
    problem: "Le nom donné au bouton pour les lecteurs d'écran (aria-label) ne contient pas le texte affiché.",
    fix: "Faire commencer l'aria-label par le texte visible, ou supprimer l'aria-label si le texte visible suffit.",
    why: "Les personnes qui pilotent à la voix disent le texte qu'elles voient (« clique sur Envoyer ») : il doit correspondre au nom du bouton.",
    suggest: (o) => removeAttr(o.fullHtml, "aria-label"),
  },
  "a4a-champ-obligatoire": {
    problem: "Ce champ est obligatoire, mais son étiquette ne l'indique pas.",
    fix: "Indiquer « (obligatoire) » dans l'étiquette, ou un astérisque expliqué en haut du formulaire.",
    why: "Tout le monde découvre l'obligation seulement à l'envoi, par une erreur ; c'est particulièrement pénible au lecteur d'écran.",
  },
  "a4a-autocomplete-manquant": {
    problem: "Ce champ demande une information personnelle mais n'a pas d'attribut autocomplete.",
    fix: "Ajouter l'attribut autocomplete avec la valeur qui correspond à l'information demandée.",
    why: "Le navigateur peut alors remplir le champ automatiquement : précieux pour les personnes avec des troubles moteurs, cognitifs ou de mémoire.",
    suggest: (o) => (typeof o.data?.autocomplete === "string" ? setAttr(o.fullHtml, "autocomplete", o.data.autocomplete) : undefined),
  },
  "a4a-navigation-inconstante": {
    problem: "Le menu de navigation n'est pas au même endroit sur cet écran que sur les autres.",
    fix: "Garder le menu principal à la même place et dans le même ordre sur tous les écrans.",
    why: "Les personnes malvoyantes ou avec des troubles cognitifs s'appuient sur des repères stables pour se déplacer dans le site.",
  },
  "a4a-lien-evitement": {
    problem: "Il n'y a pas de lien d'évitement (« Aller au contenu ») en début de page, ou il pointe vers une cible absente.",
    fix: "Ajouter, en tout premier élément de la page, un lien vers le contenu principal, visible au moins quand il reçoit le focus.",
    why: "Sans ce lien, une personne au clavier doit tabuler à travers tout le menu sur chaque page.",
    suggest: () => '<a href="#contenu" class="lien-evitement">Aller au contenu</a>\n…\n<main id="contenu" tabindex="-1">',
  },
  "a4a-alt-suspect": {
    problem: "Le texte de remplacement de cette image ne semble pas décrire son information.",
    fix: "Écrire ce que l'image apporte dans son contexte (pas « image », ni le nom du fichier) ; alt=\"\" si elle est décorative.",
    why: "Le lecteur d'écran lit ce texte à la place de l'image : « DSC_0042.jpg » ou « image » n'apprend rien.",
    suggest: (o) => setAttr(o.fullHtml, "alt", "[information transmise par l'image]"),
  },
  "a4a-svg-sans-statut": {
    problem: "Cette image SVG n'est ni masquée aux lecteurs d'écran ni nommée.",
    fix: "Décorative (ou doublée par un texte) : aria-hidden=\"true\" focusable=\"false\". Porteuse d'information : role=\"img\" et aria-label.",
    why: "Certains lecteurs d'écran annoncent « image » ou lisent son code ; d'autres l'ignorent alors qu'elle porte une information.",
    suggest: (o) => setAttr(setAttr(o.fullHtml, "aria-hidden", "true"), "focusable", "false"),
  },
  "a4a-animation": {
    problem: "Ce contenu bouge ou défile plus de 5 secondes.",
    fix: "Ajouter un bouton visible pour le mettre en pause ou l'arrêter, et ne pas le lancer automatiquement si prefers-reduced-motion est activé.",
    why: "Le mouvement empêche de se concentrer (troubles de l'attention) et peut provoquer des malaises (troubles vestibulaires).",
  },
  "a4a-glisser": {
    problem: "Ce composant s'utilise peut-être par glisser ou par un geste (balayage, pincement).",
    fix: "Prévoir des boutons (précédent, suivant, zoom +/−, monter/descendre) qui font la même chose en un simple clic.",
    why: "Les personnes avec des troubles moteurs ou qui utilisent une commande vocale ne peuvent pas faire de geste précis.",
  },
};

/** Explications pour une règle, avec repli sur l'aide axe. */
export function fixFor(rule: string): RuleFix | undefined {
  return ruleFixes[rule];
}

/** Pourquoi par thématique RGAA, quand la règle n'a pas d'explication dédiée. */
export const topicWhy: Record<number, string> = {
  1: WHY_SR_IMAGE,
  2: "Les lecteurs d'écran identifient les cadres par leur titre ; sans titre, leur contenu est une boîte noire.",
  3: "Les personnes malvoyantes ou daltoniennes ne perçoivent pas les informations données par la couleur seule ou peu contrastées.",
  4: "Les personnes sourdes ou aveugles ont besoin de sous-titres, de transcriptions ou d'audiodescription pour accéder aux médias.",
  5: "Le lecteur d'écran lit les tableaux cellule par cellule ; sans en-têtes reliés, les données n'ont plus de sens.",
  6: WHY_NAME,
  7: WHY_ARIA,
  8: "Un code mal formé ou sans langue ni titre perturbe les technologies d'assistance et la compréhension de la page.",
  9: WHY_STRUCTURE,
  10: "Les personnes malvoyantes adaptent l'affichage (zoom, couleurs, espacements) ; la présentation doit le supporter sans perte d'information.",
  11: "Remplir un formulaire sans étiquettes, aides ni messages d'erreur clairs est impossible au lecteur d'écran et difficile avec des troubles cognitifs.",
  12: "Les personnes qui naviguent au clavier ou au lecteur d'écran ont besoin de repères et de raccourcis pour se déplacer dans le site.",
  13: "Les contenus qui bougent, clignotent ou expirent gênent les personnes lentes, distraites ou épileptiques.",
};
