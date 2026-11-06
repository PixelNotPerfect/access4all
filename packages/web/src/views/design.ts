import { getCriteria, type Criterion } from "@access4all/core";
import { verdict } from "../contrast.js";
import { announce, download, esc, slug } from "../download.js";
import { store, emptyDesign, type DesignStatus } from "../state.js";

const LABELS: Record<DesignStatus, string> = { ok: "Respecté", ko: "À corriger", na: "Sans objet" };

function designCriteria(): Criterion[] {
  return getCriteria({ wcag22: true, role: "design" });
}

function criterionBlock(c: Criterion): string {
  const s = store.design.status[c.id];
  const name = `d-${c.id}`;
  return `
  <li class="crit" data-id="${c.id}">
    <fieldset>
      <legend><span class="crit-id">${c.id}</span> ${esc(c.title)} <span class="badge badge-${c.impact}">${c.impact}</span></legend>
      <p class="advice">${esc(c.design ?? c.content ?? "")}</p>
      <div class="choices">
        ${(Object.keys(LABELS) as DesignStatus[])
          .map((k) => `<label><input type="radio" name="${name}" value="${k}" ${s === k ? "checked" : ""}> ${LABELS[k]}</label>`)
          .join("")}
      </div>
      <label class="note-label" for="n-${c.id}">Remarque</label>
      <textarea id="n-${c.id}" data-note="${c.id}" rows="1">${esc(store.design.notes[c.id] ?? "")}</textarea>
    </fieldset>
  </li>`;
}

function summary(): string {
  const list = designCriteria();
  const counts = { ok: 0, ko: 0, na: 0 };
  for (const c of list) {
    const s = store.design.status[c.id];
    if (s) counts[s]++;
  }
  const todo = list.length - counts.ok - counts.ko - counts.na;
  return `${counts.ko} point(s) à corriger, ${counts.ok} respecté(s), ${counts.na} sans objet, ${todo} restant(s) à revoir sur ${list.length}.`;
}

function toMarkdown(): string {
  const list = designCriteria().filter((c) => store.design.status[c.id] === "ko");
  const lines = [`# Revue d'accessibilité des maquettes — ${store.design.name}`, "", summary(), "", "## Points à corriger avant livraison", ""];
  for (const c of list) {
    lines.push(`- [ ] **${c.id}** (${c.impact}) ${c.title}`, `  - ${c.design ?? c.content ?? ""}`);
    if (store.design.notes[c.id]) lines.push(`  - Remarque : ${store.design.notes[c.id]}`);
    lines.push(`  - ${c.url}`);
  }
  if (!list.length) lines.push("Aucun point à corriger.");
  return lines.join("\n") + "\n";
}

export function designView(): string {
  const list = designCriteria();
  let topic = -1;
  const groups: string[] = [];
  for (const c of list) {
    if (c.topic.number !== topic) {
      if (topic !== -1) groups.push("</ul></section>");
      topic = c.topic.number;
      groups.push(`<section><h3>${c.topic.number}. ${esc(c.topic.title)}</h3><ul class="crit-list">`);
    }
    groups.push(criterionBlock(c));
  }
  groups.push("</ul></section>");

  return `
  <h1>Revue d'accessibilité des maquettes</h1>
  <p class="lead">${list.length} critères se jouent dès la conception. Passez chaque écran en revue, notez ce qui est à corriger, puis exportez la liste avant de livrer au développeur.</p>

  <section class="panel" aria-labelledby="contraste-titre">
    <h2 id="contraste-titre">Vérifier un contraste</h2>
    <form id="contrast-form" class="contrast">
      <div><label for="fg">Couleur du texte ou de l'élément</label><input id="fg" name="fg" value="#666666" autocomplete="off" aria-describedby="hex-aide"></div>
      <div><label for="bg">Couleur de fond</label><input id="bg" name="bg" value="#ffffff" autocomplete="off" aria-describedby="hex-aide"></div>
      <p id="hex-aide" class="hint">Format hexadécimal, par exemple #1a1a1a.</p>
    </form>
    <div id="contrast-result" aria-live="polite"></div>
  </section>

  <section class="panel" aria-labelledby="revue-titre">
    <h2 id="revue-titre">Checklist</h2>
    <div class="field"><label for="design-name">Nom du projet ou de la maquette</label><input id="design-name" value="${esc(store.design.name)}"></div>
    <p id="design-summary" class="summary">${summary()}</p>
    <div class="actions">
      <button type="button" id="design-export">Exporter les points à corriger (Markdown)</button>
      <button type="button" id="design-reset" class="secondary">Recommencer une revue</button>
    </div>
    ${groups.join("")}
  </section>`;
}

function renderContrast(): void {
  const fg = (document.getElementById("fg") as HTMLInputElement).value;
  const bg = (document.getElementById("bg") as HTMLInputElement).value;
  const out = document.getElementById("contrast-result")!;
  const v = verdict(fg, bg);
  if (!v) {
    out.innerHTML = `<p class="error">Saisissez deux couleurs au format hexadécimal (#rgb ou #rrggbb).</p>`;
    return;
  }
  const row = (label: string, ok: boolean, need: string) =>
    `<li class="${ok ? "pass" : "fail"}">${label} (${need}) : <strong>${ok ? "conforme" : "insuffisant"}</strong></li>`;
  out.innerHTML = `
    <p class="ratio"><span class="swatch" style="color:${esc(fg)};background:${esc(bg)}" aria-hidden="true">Aa</span> Rapport de contraste : <strong>${v.ratio.toString().replace(".", ",")}:1</strong></p>
    <ul class="verdict">
      ${row("Texte courant", v.text, "4,5:1, critère 3.2")}
      ${row("Texte de grande taille (24 px, ou 18,5 px gras)", v.largeText, "3:1, critère 3.2")}
      ${row("Composants d'interface et graphiques", v.ui, "3:1, critère 3.3")}
    </ul>`;
}

export function bindDesign(root: HTMLElement, rerender: () => void): void {
  const form = root.querySelector<HTMLFormElement>("#contrast-form")!;
  form.addEventListener("input", renderContrast);
  form.addEventListener("submit", (e) => e.preventDefault());
  renderContrast();

  root.querySelector<HTMLInputElement>("#design-name")!.addEventListener("input", (e) => {
    store.design.name = (e.target as HTMLInputElement).value;
    store.saveDesign();
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.type === "radio" && t.name.startsWith("d-")) {
      store.design.status[t.name.slice(2)] = t.value as DesignStatus;
      store.saveDesign();
      root.querySelector("#design-summary")!.textContent = summary();
    }
  });
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLTextAreaElement;
    if (t.dataset.note) {
      store.design.notes[t.dataset.note] = t.value;
      store.saveDesign();
    }
  });
  root.querySelector("#design-export")!.addEventListener("click", () => {
    download(`revue-maquettes-${slug(store.design.name)}.md`, toMarkdown(), "text/markdown");
    announce("Fichier Markdown téléchargé.");
  });
  root.querySelector("#design-reset")!.addEventListener("click", () => {
    if (!confirm("Effacer toutes les réponses de cette revue ?")) return;
    store.design = emptyDesign();
    store.saveDesign();
    rerender();
    announce("Revue réinitialisée.");
  });
}
