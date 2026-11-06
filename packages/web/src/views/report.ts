import {
  RGAA_VERSION,
  buildActionPlan,
  computeCompliance,
  getCriterion,
  getTopics,
  planToCsv,
  planToIcs,
  type ActionPlan,
  type ComplianceReport,
} from "@access4all/core";
import { announce, download, esc, slug } from "../download.js";
import { store } from "../state.js";

const fmt = (n: number | null) => (n === null ? "—" : `${n.toString().replace(".", ",")} %`);
const frDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const OWNER: Record<string, string> = { design: "Design", dev: "Développement", content: "Contenu", pilotage: "Pilotage" };

function report(): ComplianceReport {
  const a = store.audit;
  return computeCompliance(a.pages.map((p) => ({ page: p.name, results: a.results[p.id] ?? {} })), { wcag22: a.wcag22 });
}

function plan(r: ComplianceReport): ActionPlan {
  const a = store.audit;
  const findings = Object.entries(r.criteria)
    .filter(([, s]) => s === "NC")
    .map(([criterionId]) => ({
      criterionId,
      pages: a.pages.filter((p) => a.results[p.id]?.[criterionId] === "NC").map((p) => p.name),
      note: a.notes[criterionId] || undefined,
    }));
  return buildActionPlan(findings, a.plan);
}

function planHtml(p: ActionPlan): string {
  return p.sprints
    .map(
      (s) => `
    <section class="sprint">
      <h3>Lot ${s.number} : du ${frDate(s.start)} au ${frDate(s.end)}</h3>
      <table>
        <caption class="sr-only">Actions du lot ${s.number}</caption>
        <thead><tr><th scope="col">Action</th><th scope="col">Gravité</th><th scope="col">Effort</th><th scope="col">Responsables</th><th scope="col">Pages</th></tr></thead>
        <tbody>
          ${s.items
            .map(
              (it) => `<tr>
              <th scope="row">${it.url ? `<a href="${esc(it.url)}">${esc(it.title)}</a>` : esc(it.title)}${it.advice.length ? `<ul class="advice-list">${it.advice.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</th>
              <td><span class="badge badge-${it.impact}">${it.impact}</span></td>
              <td>${it.effort}/3</td>
              <td>${it.owners.map((o) => OWNER[o] ?? o).join(", ")}</td>
              <td>${it.pages.length ? esc(it.pages.join(", ")) : "—"}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>`,
    )
    .join("");
}

export function reportView(): string {
  const a = store.audit;
  const r = report();
  const p = plan(r);
  const topics = getTopics();
  const nc = Object.entries(r.criteria).filter(([, s]) => s === "NC").map(([id]) => getCriterion(id)!);
  const tested = r.counts.C + r.counts.NC + r.counts.NA;

  return `
  <h1>Rapport d'audit et calendrier d'actions</h1>
  <p class="lead">Audit de « ${esc(a.name)} » selon le RGAA ${RGAA_VERSION}${a.wcag22 ? ", complété par les critères WCAG 2.2" : ""}, sur ${a.pages.length} page(s).</p>
  ${r.incomplete ? `<p class="warning" role="note"><strong>Audit incomplet :</strong> ${r.counts.NT} critère(s) n'ont été évalués sur aucune page. Le taux ci-dessous ne porte que sur les ${tested} critères évalués. <a href="#/grille">Compléter la grille</a>.</p>` : ""}

  <section class="panel" aria-labelledby="synthese">
    <h2 id="synthese">Synthèse</h2>
    <dl class="kpis">
      <div><dt>Taux de conformité global</dt><dd>${fmt(r.globalRate)}</dd></div>
      <div><dt>Taux moyen par page</dt><dd>${fmt(r.averageRate)}</dd></div>
      <div><dt>Mention légale</dt><dd>${r.legalStatus ? `Accessibilité : ${r.legalStatus}` : "—"}</dd></div>
      <div><dt>Critères</dt><dd>${r.counts.C} conformes, ${r.counts.NC} non conformes, ${r.counts.NA} non applicables</dd></div>
    </dl>
    <p class="hint">Taux global = critères conformes ÷ (conformes + non conformes). Un critère est non conforme s'il l'est sur au moins une page. Mention : 100 % totalement conforme, 50 % ou plus partiellement conforme, moins de 50 % non conforme. ${a.wcag22 ? "Pour le taux opposable, décochez les critères WCAG 2.2 dans la grille." : ""}</p>
  </section>

  <section class="panel" aria-labelledby="par-theme">
    <h2 id="par-theme">Résultats par thématique</h2>
    <table>
      <caption class="sr-only">Nombre de critères par statut et taux pour chaque thématique</caption>
      <thead><tr><th scope="col">Thématique</th><th scope="col">Conformes</th><th scope="col">Non conformes</th><th scope="col">Non applicables</th><th scope="col">Non testés</th><th scope="col">Taux</th></tr></thead>
      <tbody>
        ${r.perTopic
          .map((t) => `<tr><th scope="row">${t.topic}. ${esc(topics.find((x) => x.number === t.topic)?.title ?? "")}</th><td>${t.counts.C}</td><td>${t.counts.NC}</td><td>${t.counts.NA}</td><td>${t.counts.NT}</td><td>${fmt(t.rate)}</td></tr>`)
          .join("")}
      </tbody>
    </table>
    <h3>Par page</h3>
    <table>
      <caption class="sr-only">Taux de conformité par page</caption>
      <thead><tr><th scope="col">Page</th><th scope="col">URL</th><th scope="col">Non conformes</th><th scope="col">Taux</th></tr></thead>
      <tbody>${r.perPage.map((pp, i) => `<tr><th scope="row">${esc(pp.page)}</th><td>${esc(a.pages[i]?.url || "—")}</td><td>${pp.counts.NC}</td><td>${fmt(pp.rate)}</td></tr>`).join("")}</tbody>
    </table>
  </section>

  <section class="panel" aria-labelledby="non-conformites">
    <h2 id="non-conformites">Non-conformités (${nc.length})</h2>
    ${nc.length ? `<ul class="nc-list">${nc.map((c) => `<li><strong>${c.id}</strong> <span class="badge badge-${c.impact}">${c.impact}</span> ${esc(c.title)}${a.notes[c.id] ? `<br><em>Remarque : ${esc(a.notes[c.id])}</em>` : ""}</li>`).join("")}</ul>` : "<p>Aucune non-conformité relevée.</p>"}
  </section>

  <section class="panel" aria-labelledby="calendrier">
    <h2 id="calendrier">Calendrier d'actions</h2>
    <p>Les obligations légales viennent en premier, puis les non-conformités classées par gravité, nombre de pages touchées et effort. Chaque lot respecte la capacité de l'équipe (effort de 1 à 3 par action).</p>
    <form id="plan-form" class="filters">
      <div><label for="p-start">Date de début</label><input type="date" id="p-start" value="${esc(a.plan.startDate)}" required></div>
      <div><label for="p-days">Durée d'un lot (jours)</label><input type="number" id="p-days" min="1" max="90" value="${a.plan.sprintDays}" required></div>
      <div><label for="p-cap">Capacité par lot (points d'effort)</label><input type="number" id="p-cap" min="1" max="100" value="${a.plan.capacity}" required></div>
    </form>
    <p id="plan-summary" class="summary">${p.items.length} action(s) en ${p.sprints.length} lot(s), du ${frDate(p.startDate)} au ${frDate(p.endDate)}.</p>
    <div class="actions">
      <button type="button" id="dl-ics">Ajouter à mon agenda (.ics)</button>
      <button type="button" id="dl-csv">Exporter pour un tableur (CSV)</button>
      <button type="button" id="print" class="secondary">Imprimer ou enregistrer en PDF</button>
    </div>
    <div id="plan">${planHtml(p)}</div>
  </section>`;
}

export function bindReport(root: HTMLElement, rerender: () => void): void {
  const form = root.querySelector<HTMLFormElement>("#plan-form")!;
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("change", () => {
    const start = (root.querySelector("#p-start") as HTMLInputElement).value;
    const days = Number((root.querySelector("#p-days") as HTMLInputElement).value);
    const cap = Number((root.querySelector("#p-cap") as HTMLInputElement).value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !(days >= 1) || !(cap >= 1)) {
      announce("Vérifiez la date de début, la durée et la capacité.");
      return;
    }
    store.audit.plan = { startDate: start, sprintDays: days, capacity: cap };
    store.saveAudit();
    const p = plan(report());
    root.querySelector("#plan")!.innerHTML = planHtml(p);
    const msg = `${p.items.length} action(s) en ${p.sprints.length} lot(s), du ${frDate(p.startDate)} au ${frDate(p.endDate)}.`;
    root.querySelector("#plan-summary")!.textContent = msg;
    announce(`Calendrier mis à jour : ${msg}`);
  });
  const name = () => slug(store.audit.name);
  root.querySelector("#dl-ics")!.addEventListener("click", () => {
    download(`plan-accessibilite-${name()}.ics`, planToIcs(plan(report()), { name: `Accessibilité – ${store.audit.name}` }), "text/calendar");
    announce("Calendrier .ics téléchargé.");
  });
  root.querySelector("#dl-csv")!.addEventListener("click", () => {
    download(`plan-accessibilite-${name()}.csv`, planToCsv(plan(report())), "text/csv");
    announce("Fichier CSV téléchargé.");
  });
  root.querySelector("#print")!.addEventListener("click", () => window.print());
  void rerender;
}
