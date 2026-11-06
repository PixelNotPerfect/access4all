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
