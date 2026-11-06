import "./style.css";
import { homeView } from "./views/home.js";
import { bindDesign, designView } from "./views/design.js";
import { bindGrid, gridView } from "./views/grid.js";
import { bindReport, reportView } from "./views/report.js";

interface Route {
  title: string;
  view: () => string;
  bind?: (root: HTMLElement, rerender: () => void) => void;
}

const ROUTES: Record<string, Route> = {
  "/": { title: "Accueil", view: homeView },
  "/maquettes": { title: "Revue de maquettes", view: designView, bind: bindDesign },
  "/grille": { title: "Grille de recette et d'audit", view: gridView, bind: bindGrid },
  "/rapport": { title: "Rapport et calendrier", view: reportView, bind: bindReport },
};

const mainRef: { el: HTMLElement } = { el: document.getElementById("contenu")! };
let firstRender = true;

function render(focus = true): void {
  const path = location.hash.replace(/^#/, "") || "/";
  const route = ROUTES[path] ?? ROUTES["/"];
  // Remplace le conteneur pour repartir d'écouteurs d'événements propres.
  const fresh = mainRef.el.cloneNode(false) as HTMLElement;
  mainRef.el.replaceWith(fresh);
  mainRef.el = fresh;
  fresh.innerHTML = route.view();
  route.bind?.(fresh, () => render(true));
  document.title = `${route.title} – access4all`;
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".site-header nav a")) {
    if (a.getAttribute("href") === `#${path}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const h1 = fresh.querySelector<HTMLElement>("h1");
  h1?.setAttribute("tabindex", "-1");
  if (focus && !firstRender) h1?.focus();
  firstRender = false;
}

window.addEventListener("hashchange", () => {
  // Le lien d'évitement (#contenu) ne doit pas changer de vue.
  if (location.hash === "#contenu") return;
  render();
});
document.querySelector(".skip")!.addEventListener("click", (e) => {
  e.preventDefault();
  mainRef.el.focus();
});
render();
