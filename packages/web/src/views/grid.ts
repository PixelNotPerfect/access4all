import { computeCompliance, getCriteria, type Criterion, type Status } from "@access4all/core";
import { announce, download, esc, slug } from "../download.js";
import { emptyAudit, importCliReport, newId, parseAudit, store } from "../state.js";

export const STATUS_LABELS: Record<Status, string> = { C: "Conforme", NC: "Non conforme", NA: "Non applicable", NT: "Non testé" };
const STATUSES: Status[] = ["C", "NC", "NA", "NT"];

let currentPageId: string | undefined;
let filter = { topic: "", status: "", role: "" };

function currentPage() {
  const a = store.audit;
  if (!a.pages.length) a.pages.push({ id: newId(), name: "Accueil", url: "" });
  if (!currentPageId || !a.pages.some((p) => p.id === currentPageId)) currentPageId = a.pages[0].id;
  return a.pages.find((p) => p.id === currentPageId)!;
}

function criteria(): Criterion[] {
  return getCriteria({ wcag22: store.audit.wcag22 });
}

function statusOf(pageId: string, id: string): Status {
  return store.audit.results[pageId]?.[id] ?? "NT";
}

function summaryText(): string {
  const a = store.audit;
  const r = computeCompliance(
    a.pages.map((p) => ({ page: p.name, results: a.results[p.id] ?? {} })),
    { wcag22: a.wcag22 },
  );
  const page = currentPage();
  const pr = r.perPage.find((p) => p.page === page.name);
  const fmt = (n: number | null) => (n === null ? "non calculable" : `${n.toString().replace(".", ",")} %`);
  return `Page « ${page.name} » : ${pr ? `${pr.counts.C} conforme(s), ${pr.counts.NC} non conforme(s), ${pr.counts.NA} non applicable(s), ${pr.counts.NT} non testé(s)` : ""}. Taux global de l'échantillon : ${fmt(r.globalRate)}.`;
}

function criterionBlock(c: Criterion, pageId: string): string {
  const s = statusOf(pageId, c.id);
  const tests = c.tests
    .map(
      (t) => `<li><p><strong>Test ${esc(t.id)}</strong> : ${esc(t.text)}</p>${t.methodology ? `<p class="method-title">Méthode :</p><p class="method">${esc(t.methodology)}</p>` : ""}</li>`,
    )
    .join("");
  const advice = [c.design && `Design : ${c.design}`, c.dev && `Développement : ${c.dev}`, c.content && `Contenu : ${c.content}`].filter(Boolean) as string[];
  return `
  <li class="crit status-${s}" data-id="${c.id}">
    <fieldset>
      <legend><span class="crit-id">${c.id}</span> ${esc(c.title)} <span class="badge badge-${c.impact}">${c.impact}</span>${c.automation !== "manuel" ? ` <span class="badge badge-auto">${c.automation === "auto" ? "automatisable" : "partiellement automatisable"}</span>` : ""}</legend>
      <div class="choices">
        ${STATUSES.map((k) => `<label><input type="radio" name="s-${c.id}" value="${k}" ${s === k ? "checked" : ""}> ${STATUS_LABELS[k]}</label>`).join("")}
      </div>
      <details>
        <summary>Tests, méthode et conseils<span class="sr-only"> pour le critère ${c.id}</span></summary>
        <ol class="tests">${tests}</ol>
        ${advice.length ? `<ul class="advice-list">${advice.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        <p><a href="${esc(c.url)}">${c.source === "RGAA" ? "Critère sur le site officiel du RGAA" : "Comprendre ce critère WCAG 2.2 (en anglais)"}<span class="sr-only"> ${c.id}</span></a> · Références WCAG : ${esc(c.wcag.join(", "))}</p>
      </details>
      <label class="note-label" for="note-${c.id}">Remarque (toutes pages)</label>
      <textarea id="note-${c.id}" data-note="${c.id}" rows="1">${esc(store.audit.notes[c.id] ?? "")}</textarea>
    </fieldset>
  </li>`;
}

function listHtml(): string {
  const page = currentPage();
  const list = criteria().filter(
    (c) =>
      (!filter.topic || String(c.topic.number) === filter.topic) &&
      (!filter.status || statusOf(page.id, c.id) === filter.status) &&
      (!filter.role || c.owners.includes(filter.role as never)),
  );
  if (!list.length) return `<p>Aucun critère ne correspond aux filtres.</p>`;
  let topic = -1;
  const out: string[] = [];
  for (const c of list) {
    if (c.topic.number !== topic) {
      if (topic !== -1) out.push("</ul></section>");
      topic = c.topic.number;
      out.push(`<section><h3>${c.topic.number}. ${esc(c.topic.title)}</h3><ul class="crit-list">`);
    }
    out.push(criterionBlock(c, page.id));
  }
  out.push("</ul></section>");
  return `<p class="count">${list.length} critère(s) affiché(s).</p>${out.join("")}`;
}

function pagesHtml(): string {
  const page = currentPage();
  return store.audit.pages
    .map(
      (p, i) => `
    <li>
      <fieldset class="page-row">
        <legend class="sr-only">Page ${i + 1}</legend>
        <label><input type="radio" name="current-page" value="${p.id}" ${p.id === page.id ? "checked" : ""}> Évaluer<span class="sr-only"> la page ${i + 1}</span></label>
        <label>Nom<span class="sr-only"> de la page ${i + 1}</span> <input data-page-name="${p.id}" value="${esc(p.name)}"></label>
        <label>URL<span class="sr-only"> de la page ${i + 1}</span> <input data-page-url="${p.id}" value="${esc(p.url)}" type="url" autocomplete="url"></label>
        <button type="button" class="secondary" data-remove-page="${p.id}" ${store.audit.pages.length < 2 ? "disabled" : ""}>Retirer<span class="sr-only"> la page ${esc(p.name)}</span></button>
      </fieldset>
    </li>`,
    )
    .join("");
}

export function gridView(): string {
  const a = store.audit;
  const topics = [...new Map(criteria().map((c) => [c.topic.number, c.topic.title])).entries()];
  return `
  <h1>Grille de recette et d'audit</h1>
  <p class="lead">Pour chaque page de l'échantillon, indiquez le statut de chaque critère. Les statuts sont enregistrés dans ce navigateur au fil de l'eau.</p>

  <section class="panel" aria-labelledby="audit-titre">
    <h2 id="audit-titre">Audit</h2>
    <div class="field"><label for="audit-name">Nom du site ou de l'application</label><input id="audit-name" value="${esc(a.name)}"></div>
    <div class="field checkbox"><input type="checkbox" id="audit-wcag22" ${a.wcag22 ? "checked" : ""}><label for="audit-wcag22">Inclure les critères WCAG 2.2 absents du RGAA (niveaux A et AA)</label></div>
    <div class="actions">
      <label class="file-button">Importer un rapport du scan (JSON de « access4all check »)<input type="file" id="import-cli" accept="application/json,.json"></label>
      <label class="file-button">Ouvrir un audit enregistré<input type="file" id="import-audit" accept="application/json,.json"></label>
      <button type="button" id="export-audit">Enregistrer l'audit (JSON)</button>
      <button type="button" id="reset-audit" class="secondary">Nouvel audit</button>
    </div>
  </section>

  <section class="panel" aria-labelledby="pages-titre">
    <h2 id="pages-titre">Échantillon de pages</h2>
    <ul class="pages" id="pages">${pagesHtml()}</ul>
    <button type="button" id="add-page">Ajouter une page</button>
  </section>

  <section class="panel" aria-labelledby="criteres-titre">
    <h2 id="criteres-titre">Critères</h2>
    <p id="grid-summary" class="summary">${esc(summaryText())}</p>
    <form id="filters" class="filters">
      <div><label for="f-topic">Thématique</label><select id="f-topic"><option value="">Toutes</option>${topics.map(([n, t]) => `<option value="${n}" ${filter.topic === String(n) ? "selected" : ""}>${n}. ${esc(t)}</option>`).join("")}</select></div>
      <div><label for="f-status">Statut</label><select id="f-status"><option value="">Tous</option>${STATUSES.map((s) => `<option value="${s}" ${filter.status === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}</select></div>
      <div><label for="f-role">Responsable</label><select id="f-role"><option value="">Tous</option><option value="design" ${filter.role === "design" ? "selected" : ""}>Design</option><option value="dev" ${filter.role === "dev" ? "selected" : ""}>Développement</option><option value="content" ${filter.role === "content" ? "selected" : ""}>Contenu</option></select></div>
    </form>
    <div id="crit-list">${listHtml()}</div>
    <p><a class="button" href="#/rapport">Voir le rapport et le calendrier</a></p>
  </section>`;
}

async function readFile(input: HTMLInputElement): Promise<string | undefined> {
  const file = input.files?.[0];
  input.value = "";
  return file?.text();
}

export function bindGrid(root: HTMLElement, rerender: () => void): void {
  const refreshList = () => {
    root.querySelector("#crit-list")!.innerHTML = listHtml();
    root.querySelector("#grid-summary")!.textContent = summaryText();
  };
  const refreshPages = () => {
    root.querySelector("#pages")!.innerHTML = pagesHtml();
  };

  root.querySelector<HTMLInputElement>("#audit-name")!.addEventListener("input", (e) => {
    store.audit.name = (e.target as HTMLInputElement).value;
    store.saveAudit();
  });
  root.querySelector<HTMLInputElement>("#audit-wcag22")!.addEventListener("change", (e) => {
    store.audit.wcag22 = (e.target as HTMLInputElement).checked;
    store.saveAudit();
    rerender();
  });

  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name?.startsWith("s-")) {
      const page = currentPage();
      (store.audit.results[page.id] ??= {})[t.name.slice(2)] = t.value as Status;
      store.saveAudit();
      const li = t.closest(".crit");
      if (li) li.className = `crit status-${t.value}`;
      root.querySelector("#grid-summary")!.textContent = summaryText();
    } else if (t.name === "current-page") {
      currentPageId = t.value;
      refreshList();
      announce(`Évaluation de la page ${currentPage().name}.`);
    } else if (t.closest("#filters")) {
      filter = {
        topic: (root.querySelector("#f-topic") as HTMLSelectElement).value,
        status: (root.querySelector("#f-status") as HTMLSelectElement).value,
        role: (root.querySelector("#f-role") as HTMLSelectElement).value,
      };
      refreshList();
      announce(root.querySelector("#crit-list .count")?.textContent ?? "Aucun critère ne correspond aux filtres.");
    }
  });

  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.note) {
      store.audit.notes[t.dataset.note] = t.value;
      store.saveAudit();
    } else if (t.dataset.pageName || t.dataset.pageUrl) {
      const p = store.audit.pages.find((x) => x.id === (t.dataset.pageName ?? t.dataset.pageUrl));
      if (!p) return;
      if (t.dataset.pageName) p.name = t.value;
      else p.url = t.value;
      store.saveAudit();
      root.querySelector("#grid-summary")!.textContent = summaryText();
    }
  });

  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-page]");
    if (!btn) return;
    const id = btn.dataset.removePage!;
    const p = store.audit.pages.find((x) => x.id === id);
    if (!p || !confirm(`Retirer la page « ${p.name} » et ses résultats ?`)) return;
    store.audit.pages = store.audit.pages.filter((x) => x.id !== id);
    delete store.audit.results[id];
    store.saveAudit();
    refreshPages();
    refreshList();
    (root.querySelector("#add-page") as HTMLButtonElement).focus();
    announce(`Page ${p.name} retirée.`);
  });

  root.querySelector("#add-page")!.addEventListener("click", () => {
    const p = { id: newId(), name: `Page ${store.audit.pages.length + 1}`, url: "" };
    store.audit.pages.push(p);
    store.saveAudit();
    refreshPages();
    root.querySelector<HTMLInputElement>(`[data-page-name="${p.id}"]`)?.focus();
    announce(`${p.name} ajoutée à l'échantillon.`);
  });

  root.querySelector<HTMLInputElement>("#import-cli")!.addEventListener("change", async (e) => {
    const text = await readFile(e.target as HTMLInputElement);
    if (!text) return;
    try {
      const r = importCliReport(store.audit, text);
      store.saveAudit();
      rerender();
      announce(`Rapport importé : ${r.pages} page(s), ${r.marked} critère(s) marqué(s) non conformes.`);
    } catch (err) {
      announce(`Import impossible : ${(err as Error).message}`);
    }
  });

  root.querySelector<HTMLInputElement>("#import-audit")!.addEventListener("change", async (e) => {
    const text = await readFile(e.target as HTMLInputElement);
    if (!text) return;
    try {
      store.audit = parseAudit(text);
      currentPageId = undefined;
      store.saveAudit();
      rerender();
      announce(`Audit « ${store.audit.name} » ouvert.`);
    } catch (err) {
      announce(`Ouverture impossible : ${(err as Error).message}`);
    }
  });

  root.querySelector("#export-audit")!.addEventListener("click", () => {
    download(`audit-${slug(store.audit.name)}.json`, JSON.stringify(store.audit, null, 2), "application/json");
    announce("Audit enregistré.");
  });

  root.querySelector("#reset-audit")!.addEventListener("click", () => {
    if (!confirm("Commencer un nouvel audit ? Pensez à enregistrer l'audit en cours.")) return;
    store.audit = emptyAudit();
    currentPageId = undefined;
    store.saveAudit();
    rerender();
    announce("Nouvel audit créé.");
  });
}
