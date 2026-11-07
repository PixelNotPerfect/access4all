import { RGAA_VERSION, WCAG_VERSION, adviceFor, type Criterion, type Impact } from "@access4all/core";
import type { CriterionFinding, Occurrence, PageAnalysis } from "./analyze.js";
import { contrastDetails, fixFor, topicWhy } from "./fixes.js";
import type { CheckReport } from "./render.js";
import { consolidate, occurrenceKey } from "./consolidate.js";

/** Au-delà de ce nombre d'écrans, le sommaire ne détaille plus les étapes de chaque écran. */
const TOC_DETAIL_MAX = 10;

/** Contexte du rendu : écrans du rapport et éléments communs à plusieurs écrans. */
interface Ctx {
  pages: PageAnalysis[];
  sharedPages: Map<string, number[]>;
}

/** Nombre maximal d'éléments détaillés par critère (les suivants sont listés). */
const MAX_DETAILED = 25;

const IMPACT_TEXT: Record<Impact, { label: string; meaning: string }> = {
  bloquant: { label: "Bloquant", meaning: "empêche certaines personnes d'accéder au contenu ou à la fonctionnalité" },
  majeur: { label: "Majeur", meaning: "rend l'usage très difficile pour certaines personnes" },
  mineur: { label: "Mineur", meaning: "gêne sans empêcher l'usage" },
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slug(...parts: (string | number)[]): string {
  return parts.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function badge(impact: Impact): string {
  return `<span class="badge badge-${impact}">${IMPACT_TEXT[impact].label}</span>`;
}

function pageLabel(a: PageAnalysis): string {
  return a.title?.trim() || a.url;
}

/** Résumé axe-core (« Corriger l'un des éléments suivants : … ») en liste lisible. */
function axeSummary(summary?: string): string {
  if (!summary) return "";
  const lines = summary.split("\n").map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const l of lines) {
    if (/^(fix|corrige)/i.test(l)) items.push(`<p class="axe-intro">${esc(l)}</p>`);
    else items.push(`<li>${esc(l)}</li>`);
  }
  return items.join("").replace(/(<li>[\s\S]*?<\/li>)+/g, (m) => `<ul>${m}</ul>`);
}

function screenshotBlock(o: Occurrence): string {
  if (o.screenshot) {
    return `<figure class="shot"><img src="${o.screenshot}" alt="Capture de l'élément ${esc(o.selector)}, encadré en rose dans la page."><figcaption>L'élément concerné est encadré en rose.</figcaption></figure>`;
  }
  const reason =
    o.visibility === "page"
      ? "Ce problème concerne la page entière (balise &lt;html&gt; ou &lt;head&gt;) : il n'y a rien à montrer à l'écran."
      : o.visibility === "hidden"
        ? "Cet élément n'occupe aucune place visible à l'écran (vide ou masqué), mais il reste présent pour le clavier ou les technologies d'assistance : il faut le corriger quand même."
        : "Pas de capture disponible pour cet élément.";
  return `<div class="shot shot-none"><p>${reason}</p></div>`;
}

function pagesList(o: Occurrence, ctx: Ctx): string {
  const idx = ctx.sharedPages.get(occurrenceKey(o));
  if (!idx) return "";
  return `<details class="where"><summary>Présent sur ${idx.length} écrans</summary><ul>${idx
    .map((i) => `<li><a href="#${slug("page", i)}">${esc(pageLabel(ctx.pages[i]))}</a></li>`)
    .join("")}</ul></details>`;
}

function occurrenceBlock(o: Occurrence, i: number, total: number, c: Criterion, id: string, ctx: Ctx): string {
  const fix = fixFor(o.rule);
  const contrast = o.rule === "color-contrast" ? contrastDetails(o) : undefined;
  const suggestion = fix?.suggest?.(o);
  const swatch = (color: string) => `<span class="swatch" style="background:${esc(color)}" aria-hidden="true"></span><code>${esc(color)}</code>`;

  const current = [
    pagesList(o, ctx),
    `<p>Sélecteur CSS : <code>${esc(o.selector)}</code></p>`,
    `<pre class="code"><code>${esc(o.fullHtml)}</code></pre>`,
    contrast?.fg && contrast.bg
      ? `<p class="colors">Couleurs mesurées : texte ${swatch(contrast.fg)} sur fond ${swatch(contrast.bg)}</p><p>${esc(contrast.current)}</p>`
      : "",
  ].join("");

  const problem = [
    `<p>${esc(fix?.problem ?? o.help)}</p>`,
    o.summary
      ? o.rule.startsWith("a4a-")
        ? `<p class="detail">${esc(o.summary)}</p>`
        : `<details class="axe"><summary>Détail technique (axe-core, règle <code>${esc(o.rule)}</code>)</summary>${axeSummary(o.summary)}</details>`
      : "",
  ].join("");

  const todo = [
    `<p>${esc(fix?.fix || adviceFor(c, "dev").join(" ") || o.help)}</p>`,
    contrast?.proposal && contrast.fixedFg && contrast.bg
      ? `<p class="colors"><strong>Proposition :</strong> ${esc(contrast.proposal)} <span class="sample" style="color:${esc(contrast.fixedFg)};background:${esc(contrast.bg)}">Exemple de texte</span></p>`
      : "",
    suggestion && suggestion !== o.fullHtml
      ? `<p class="code-label">Code proposé (à adapter, le texte entre crochets est à rédiger) :</p><pre class="code code-fix"><code>${esc(suggestion)}</code></pre>`
      : "",
  ].join("");

  const why = `<p>${esc(fix?.why ?? topicWhy[c.topic.number] ?? "")}</p>`;

  return `<article class="occ" aria-labelledby="${id}-t">
<h4 id="${id}-t">Élément ${i} sur ${total} <span class="sel">${esc(o.selector)}</span></h4>
<div class="occ-grid">
${screenshotBlock(o)}
<dl class="occ-dl">
<dt>État actuel</dt><dd>${current}</dd>
<dt>Problème</dt><dd>${problem}</dd>
<dt>À faire</dt><dd>${todo}</dd>
<dt>Pourquoi</dt><dd>${why}</dd>
</dl>
</div>
</article>`;
}

function reviewList(list: Occurrence[]): string {
  return `<ul class="review">${list
    .map(
      (o) =>
        `<li><code>${esc(o.selector)}</code> — ${esc(fixFor(o.rule)?.problem ?? o.help)}${o.rule.startsWith("a4a-") && o.summary ? `<p class="detail">${esc(o.summary)}</p>` : ""}${
          o.screenshot ? `<img class="mini" src="${o.screenshot}" alt="Capture de l'élément ${esc(o.selector)}, encadré en rose.">` : ""
        }<pre class="code"><code>${esc(o.html)}</code></pre></li>`,
    )
    .join("")}</ul>`;
}

function findingSection(f: CriterionFinding, n: number, scope: string, ctx: Ctx): string {
  const c = f.criterion;
  const id = slug(scope, "c", c.id);
  const detailed = f.violations.slice(0, MAX_DETAILED);
  const rest = f.violations.slice(MAX_DETAILED);
  const advice = adviceFor(c, "dev");
  const refs = [`<a href="${esc(c.url)}">${c.source === "RGAA" ? `Critère RGAA ${esc(c.id)}` : `WCAG ${esc(c.id.replace("WCAG-", ""))}`}</a>`, ...c.wcag.map((w) => `WCAG ${esc(w)}`)];
  return `<section class="finding finding-${c.impact}">
<h3 id="${id}"><span class="step">Étape ${n}</span> ${badge(c.impact)} <span class="crit">${esc(c.id)}</span> ${esc(c.title)}</h3>
<p class="meta"><strong>Gravité ${esc(IMPACT_TEXT[c.impact].label.toLowerCase())}</strong> : ${esc(IMPACT_TEXT[c.impact].meaning)}. ${f.violations.length} élément(s) en erreur. Références : ${refs.join(", ")}.</p>
${advice.length ? `<p class="advice"><strong>Règle générale :</strong> ${advice.map(esc).join(" ")}</p>` : ""}
${detailed.map((o, i) => occurrenceBlock(o, i + 1, f.violations.length, c, `${id}-e${i + 1}`, ctx)).join("\n")}
${rest.length ? `<details><summary>Voir les ${rest.length} autres éléments à corriger de la même façon</summary>${reviewList(rest)}</details>` : ""}
${f.toReview.length ? `<details><summary>${f.toReview.length} élément(s) que le scan n'a pas pu trancher, à vérifier à la main</summary>${reviewList(f.toReview)}</details>` : ""}
</section>`;
}

function sharedSection(shared: CriterionFinding[], ctx: Ctx): string {
  if (!shared.length) return "";
  return `<section aria-labelledby="communs" class="shared"><h2 id="communs">Problèmes communs à plusieurs écrans</h2>
<p>Ces éléments se répètent à l'identique sur plusieurs écrans : en-tête, menu, pied de page ou composant partagé. <strong>Corrigez-les en premier</strong> : une seule correction dans le composant règle tous les écrans concernés.</p>
${shared.map((f, i) => findingSection(f, i + 1, "commun", ctx)).join("\n")}
</section>`;
}

function pageSection(a: PageAnalysis, idx: number, ctx: Ctx, sharedCount: number): string {
  const id = slug("page", idx);
  const parts: string[] = [];
  parts.push(`<section class="page" aria-labelledby="${id}"><h2 id="${id}">${esc(pageLabel(a))}</h2><p class="url"><a href="${esc(a.url)}">${esc(a.url)}</a></p>`);
  if (a.error) {
    parts.push(`<p class="error"><strong>Écran non scanné</strong> : la page n'a pas pu être chargée (${esc(a.error)}). Vérifiez l'adresse ou relancez le scan.</p></section>`);
    return parts.join("\n");
  }
  if (sharedCount) {
    parts.push(`<p>Cet écran a aussi ${sharedCount} élément(s) en erreur communs à d'autres écrans : voir <a href="#communs">Problèmes communs</a>.</p>`);
  }
  if (a.failures.length === 0) {
    parts.push(
      `<p class="ok">${sharedCount ? "Aucune autre erreur détectée automatiquement sur cet écran." : "Aucune erreur détectée automatiquement sur cette page."} Faites quand même les vérifications manuelles en fin de rapport.</p>`,
    );
  } else {
    parts.push(`<p>Corrigez dans cet ordre : du plus grave au plus rapide à corriger.</p>`);
    a.failures.forEach((f, i) => parts.push(findingSection(f, i + 1, `p-${idx}`, ctx)));
  }
  if (a.reviews.length) {
    parts.push(`<section class="finding"><h3 id="${id}-rev">Points à confirmer à la main</h3><p>Le scan a repéré ces éléments sans pouvoir trancher seul (par exemple un texte sur une image de fond, une alternative d'image suspecte ou un texte qui ressemble à un titre). Vérifiez-les un par un : c'est plus rapide que de relire tout l'écran.</p>`);
    for (const f of a.reviews) {
      parts.push(`<details><summary>${badge(f.criterion.impact)} ${esc(f.criterion.id)} ${esc(f.criterion.title)} (${f.toReview.length} élément(s))</summary>${reviewList(f.toReview)}<p><a href="${esc(f.criterion.url)}">Voir le critère ${esc(f.criterion.id)}</a></p></details>`);
    }
    parts.push(`</section>`);
  }
  if (a.unmapped.length) {
    parts.push(`<section class="finding"><h3 id="${id}-other">Autres erreurs axe-core</h3>${reviewList(a.unmapped)}</section>`);
  }
  parts.push(`</section>`);
  return parts.join("\n");
}

function summaryTable(analyses: PageAnalysis[], sharedCounts: number[]): string {
  const multi = analyses.length > 1;
  const rows = analyses.map((a, i) => {
    if (a.error) {
      return `<tr><th scope="row"><a href="#${slug("page", i)}">${esc(pageLabel(a))}</a></th><td colspan="${multi ? 5 : 4}">Non scanné (erreur de chargement)</td></tr>`;
    }
    const counts = { bloquant: 0, majeur: 0, mineur: 0 };
    let elements = 0;
    for (const f of a.failures) {
      counts[f.criterion.impact]++;
      elements += f.violations.length;
    }
    return `<tr><th scope="row"><a href="#${slug("page", i)}">${esc(pageLabel(a))}</a></th><td>${counts.bloquant}</td><td>${counts.majeur}</td><td>${counts.mineur}</td><td>${elements}</td>${multi ? `<td>${sharedCounts[i]}</td>` : ""}</tr>`;
  });
  return `<div class="table-wrap"><table class="summary"><caption>Critères en échec par écran et par gravité${multi ? " (hors problèmes communs)" : ""}</caption>
<thead><tr><th scope="col">Écran</th><th scope="col">Bloquants</th><th scope="col">Majeurs</th><th scope="col">Mineurs</th><th scope="col">Éléments à corriger</th>${multi ? `<th scope="col">Éléments communs</th>` : ""}</tr></thead>
<tbody>${rows.join("")}</tbody></table></div>`;
}

function toc(analyses: PageAnalysis[], shared: CriterionFinding[], settledCount = 0): string {
  const detail = analyses.length <= TOC_DETAIL_MAX;
  const sharedItem = shared.length
    ? `<li><a href="#communs">Problèmes communs à plusieurs écrans</a><ol>${shared
        .map((f, n) => `<li><a href="#${slug("commun", "c", f.criterion.id)}">Étape ${n + 1} : ${esc(f.criterion.id)} (${f.criterion.impact}, ${f.violations.length} élément(s))</a></li>`)
        .join("")}</ol></li>`
    : "";
  return `<nav aria-labelledby="toc-t" class="toc"><h2 id="toc-t">Sommaire</h2><ol>${sharedItem}${analyses
    .map(
      (a, i) =>
        `<li><a href="#${slug("page", i)}">${esc(pageLabel(a))}</a>${
          a.error
            ? " (non scanné)"
            : !detail
              ? ` (${a.failures.length} critère(s) en échec)`
              : a.failures.length
            ? `<ol>${a.failures.map((f, n) => `<li><a href="#${slug("p", i, "c", f.criterion.id)}">Étape ${n + 1} : ${esc(f.criterion.id)} (${f.criterion.impact}, ${f.violations.length} élément(s))</a></li>`).join("")}</ol>`
            : ""
        }</li>`,
    )
    .join("")}${settledCount ? `<li><a href="#auto">Vérifié automatiquement (${settledCount} critères)</a></li>` : ""}<li><a href="#manuel">Vérifications manuelles</a></li></ol></nav>`;
}

const SETTLED_TEXT = { C: "Conforme", NA: "Non applicable", "C/NA": "Conforme ou non applicable" } as const;

function settledSection(settled: NonNullable<CheckReport["settled"]>, pages: number): string {
  if (!settled.length) return "";
  const conform = settled.filter((s) => s.status !== "NA");
  const na = settled.filter((s) => s.status === "NA");
  const link = (c: Criterion) => `<a href="${esc(c.url)}" title="${esc(c.title)}">${esc(c.id)}</a>`;
  const rows = conform
    .map(
      (s) =>
        `<tr><th scope="row">${link(s.criterion)}</th><td>${esc(s.criterion.title)}</td><td class="st st-c">${SETTLED_TEXT[s.status]}</td><td>${esc(s.reason)}</td></tr>`,
    )
    .join("");
  // Non applicables regroupés par raison : « Aucune vidéo » couvre une dizaine de critères.
  const byReason = new Map<string, Criterion[]>();
  for (const s of na) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.criterion]);
  const naList = [...byReason.entries()]
    .map(([reason, cs]) => `<li><strong>${esc(reason)}</strong> Critère${cs.length > 1 ? "s" : ""} ${cs.map(link).join(", ")}.</li>`)
    .join("");
  return `<section aria-labelledby="auto" class="auto"><h2 id="auto">Vérifié automatiquement</h2>
<p>Ces ${settled.length} critères ont été tranchés par le scan sur ${pages > 1 ? `les ${pages} écrans` : "l'écran"} (navigation au clavier, zoom à 200 %, affichage à 320 px, espacement du texte, orientation, analyse du code et des styles). Ils sortent des vérifications manuelles. Un audit de conformité les confirmera, notamment sur les contenus qui n'apparaissent qu'après une action (fenêtre, menu ouvert, étape suivante d'un formulaire).</p>
${conform.length ? `<h3>Conformes (${conform.length})</h3>
<div class="table-wrap"><table class="summary settled"><caption>Critères vérifiés conformes automatiquement</caption>
<thead><tr><th scope="col">Critère</th><th scope="col">Intitulé</th><th scope="col">Résultat</th><th scope="col">Comment c'est vérifié</th></tr></thead>
<tbody>${rows}</tbody></table></div>` : ""}
${na.length ? `<h3>Non applicables (${na.length})</h3><ul class="na-list">${naList}</ul>` : ""}
</section>`;
}

function manualSection(list: Criterion[], settledCount = 0): string {
  if (!list.length) return "";
  const byTopic = new Map<string, Criterion[]>();
  for (const c of list) {
    const k = `${c.topic.number}. ${c.topic.title}`;
    byTopic.set(k, [...(byTopic.get(k) ?? []), c]);
  }
  return `<section aria-labelledby="manuel" class="manual"><h2 id="manuel">Vérifications manuelles avant recette</h2>
<p>${settledCount ? `Le scan a déjà tranché ${settledCount} critères (voir <a href="#auto">Vérifié automatiquement</a>). Ceux-ci demandent un regard humain : vérifiez ces ${list.length} critères.` : `Un outil automatique ne détecte qu'une partie des problèmes. Vérifiez aussi ces ${list.length} critères.`}</p>
${[...byTopic.entries()]
  .map(
    ([topic, cs]) =>
      `<details><summary>${esc(topic)} (${cs.length})</summary><ul>${cs
        .map((c) => `<li>${badge(c.impact)} <a href="${esc(c.url)}">${esc(c.id)}</a> ${esc(c.title)}${adviceFor(c, "dev").map((a) => `<p class="advice">${esc(a)}</p>`).join("")}</li>`)
        .join("")}</ul></details>`,
  )
  .join("\n")}
</section>`;
}

const CSS = `
:root{--bg:#fff;--fg:#1b1b1b;--muted:#4a4a4a;--line:#d0d0d0;--card:#f6f6f6;--link:#0645ad;--code-bg:#f0f0f0;--fix-bg:#e8f5ec;--fix-line:#18753c;
--bloquant:#a4111b;--majeur:#8a4a00;--mineur:#2f4a6b;--focus:#0a58ca;--mark:#d0006f}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--muted:#c4c4c4;--line:#444;--card:#222;--link:#8ab4ff;--code-bg:#2a2a2a;--fix-bg:#16301f;--fix-line:#6fd394;
--bloquant:#ff8a8f;--majeur:#ffb760;--mineur:#9cc3ff;--focus:#8ab4ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}
a{color:var(--link)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.skip{position:absolute;left:-9999px}.skip:focus{left:16px;top:16px;background:var(--bg);padding:8px 12px;z-index:10}
header{border-bottom:1px solid var(--line);padding:24px 0}
header p{margin:.2em 0;color:var(--muted)}
h1{margin:.2em 0;font-size:2rem;overflow-wrap:anywhere}
h2,h3,a{overflow-wrap:anywhere}
h2{font-size:1.5rem;margin-top:2.2rem;border-bottom:2px solid var(--line);padding-bottom:.3rem}
h3{font-size:1.2rem;margin:0 0 .5rem}
h4{font-size:1rem;margin:0 0 .75rem}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em}
p code,li code,h4 code{background:var(--code-bg);padding:.1em .3em;border-radius:3px;overflow-wrap:anywhere}
pre.code{background:var(--code-bg);border:1px solid var(--line);border-radius:6px;padding:.6rem .8rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:.4rem 0}
pre.code-fix{background:var(--fix-bg);border-left:4px solid var(--fix-line)}
.badge{display:inline-block;font-size:.8rem;font-weight:700;padding:.1em .5em;border-radius:4px;border:2px solid currentColor;vertical-align:middle}
.badge-bloquant{color:var(--bloquant)}.badge-majeur{color:var(--majeur)}.badge-mineur{color:var(--mineur)}
.table-wrap{overflow-x:auto}
.summary{border-collapse:collapse;width:100%;margin:1rem 0}
.summary caption{text-align:left;font-weight:700;margin-bottom:.4rem}
.summary th,.summary td{border:1px solid var(--line);padding:.4rem .6rem;text-align:left}
.summary td{text-align:right;font-variant-numeric:tabular-nums}
.toc ol ol{margin:.2rem 0 .6rem}
.finding{border:1px solid var(--line);border-left:6px solid var(--line);border-radius:8px;padding:1rem;margin:1.2rem 0;background:var(--bg)}
.finding-bloquant{border-left-color:var(--bloquant)}.finding-majeur{border-left-color:var(--majeur)}.finding-mineur{border-left-color:var(--mineur)}
.step{color:var(--muted);font-weight:600}.crit{font-variant-numeric:tabular-nums}
.meta,.advice{color:var(--muted)}
.occ{background:var(--card);border-radius:8px;padding:1rem;margin:1rem 0}
.sel{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:400;font-size:.9em;background:var(--code-bg);padding:.1em .35em;border-radius:3px;overflow-wrap:anywhere}
.occ-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:1rem;align-items:start}
@media (max-width:820px){.occ-grid{grid-template-columns:1fr}}
.shot{margin:0}
.shot img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff}
.shot figcaption{font-size:.85rem;color:var(--muted);margin-top:.3rem}
.shot-none{border:1px dashed var(--line);border-radius:6px;padding:.8rem;color:var(--muted)}
.occ-dl{margin:0}
.occ-dl dt{font-weight:700;margin-top:.6rem}
.occ-dl dt:first-child{margin-top:0}
.occ-dl dd{margin:.2rem 0 0}
.occ-dl dd p{margin:.25rem 0}
.swatch{display:inline-block;width:1em;height:1em;border:1px solid var(--fg);vertical-align:-.15em;margin-right:.2em;border-radius:2px}
.sample{display:inline-block;padding:.1em .5em;border:1px solid var(--line);border-radius:4px;margin-left:.3em}
details{margin:.6rem 0}
summary{cursor:pointer;font-weight:600}
.axe ul{margin:.3rem 0;padding-left:1.2rem}
.axe p{margin:.3rem 0}
ul.review{padding-left:1.2rem}
.ok{font-weight:600}
.detail{margin:.3rem 0}
img.mini{display:block;max-width:min(100%,480px);height:auto;border:1px solid var(--line);border-radius:6px;margin:.4rem 0;background:#fff}
.settled td{text-align:left}
.na-list li{margin:.3rem 0}
.st{font-weight:700;white-space:nowrap}.st-c{color:var(--fix-line)}.st-na{color:var(--muted)}
.error{border-left:4px solid var(--bloquant);padding-left:.6rem}
.where{margin:0 0 .4rem}
footer{border-top:1px solid var(--line);margin-top:3rem;padding:1rem 0 2rem;color:var(--muted);font-size:.9rem}
@media print{details{display:block}details>*{display:block}.skip,.toc{display:none}.finding,.occ{break-inside:avoid}}
`;

/** Rapport HTML autonome (images incluses) et lui-même accessible. */
export function renderHtmlReport(report: CheckReport, options: { generatedAt?: Date; productName?: string } = {}): string {
  const date = (options.generatedAt ?? new Date()).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const { shared, sharedPages, pages } = consolidate(report.analyses);
  const settled = report.settled ?? [];
  const ctx: Ctx = { pages, sharedPages };
  const sharedCounts = report.analyses.map((a, i) =>
    a.failures.reduce((t, f) => t + f.violations.filter((o) => sharedPages.get(occurrenceKey(o))?.includes(i)).length, 0),
  );
  const own = pages.reduce((s, a) => s + a.failures.reduce((t, f) => t + f.violations.length, 0), 0);
  const common = shared.reduce((s, f) => s + f.violations.length, 0);
  const errors = pages.filter((a) => a.error).length;
  const n = report.analyses.length;
  const subject = options.productName ?? (n === 1 ? pageLabel(report.analyses[0]) : `${n} écrans`);
  const title = `Rapport d'accessibilité – ${subject}`;
  const stats = [
    n > 1 ? `${n - errors} écran(s) scanné(s)${errors ? `, ${errors} en erreur de chargement` : ""}.` : "",
    common ? `${common} élément(s) commun(s) à plusieurs écrans, à corriger une fois.` : "",
    `${own} élément(s) ${common ? "propres à un écran" : "à corriger"} détecté(s) automatiquement.`,
  ].filter(Boolean).join(" ");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header><div class="wrap">
<p>access4all · RGAA ${RGAA_VERSION} + WCAG ${WCAG_VERSION}</p>
<h1>${esc(title)}</h1>
<p>Généré le ${esc(date)}. ${esc(stats)}</p>
</div></header>
<main id="contenu" class="wrap">
<section aria-labelledby="synthese"><h2 id="synthese">Synthèse</h2>
${summaryTable(pages, sharedCounts)}
<p>Pour chaque élément, le rapport montre une capture (l'élément est encadré en rose), son <strong>état actuel</strong> (code HTML), le <strong>problème</strong>, <strong>ce qu'il faut faire</strong> avec une proposition de code, et <strong>pourquoi</strong> c'est important. Le texte entre crochets dans les propositions est à rédiger selon le contexte.</p>
</section>
${toc(pages, shared, settled.length)}
${sharedSection(shared, ctx)}
${pages.map((a, i) => pageSection(a, i, ctx, sharedCounts[i])).join("\n")}
${settledSection(settled, report.analyses.filter((a) => !a.error).length)}
${manualSection(report.manual, settled.length)}
</main>
<footer><div class="wrap"><p>Rapport généré par access4all avec axe-core et des tests complémentaires dans le navigateur (clavier, zoom, reflow, espacement, orientation). Un test automatique ne remplace pas un audit : il détecte une partie des non-conformités. Référentiel : <a href="https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/">RGAA ${RGAA_VERSION}</a> et <a href="https://www.w3.org/TR/WCAG22/">WCAG ${WCAG_VERSION}</a>.</p></div></footer>
</body>
</html>
`;
}
