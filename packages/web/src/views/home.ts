import { RGAA_VERSION, WCAG_VERSION } from "@access4all/core";

export function homeView(): string {
  return `
  <h1>Rendre vos produits numériques accessibles, à chaque étape</h1>
  <p class="lead">Une boîte à outils fondée sur le RGAA ${RGAA_VERSION}, complété par les WCAG ${WCAG_VERSION}, pour chaque métier du projet.</p>
  <ul class="cards">
    <li class="card">
      <h2><a href="#/maquettes">Designer : revoir mes maquettes</a></h2>
      <p>Une checklist des critères qui se décident à la conception (contrastes, couleur seule, focus, cibles, titres, formulaires…), avec un vérificateur de contraste et un conseil pour chaque point. Exportez la liste des corrections avant de livrer au développeur.</p>
    </li>
    <li class="card">
      <h2>Développeur : vérifier mon code avant la recette</h2>
      <p>Lancez la commande <code>npx access4all check http://localhost:3000</code> : elle scanne vos pages et vous dit, étape par étape, quoi corriger. Importez ensuite son rapport JSON dans la grille d'audit.</p>
    </li>
    <li class="card">
      <h2><a href="#/grille">BA : dérouler la recette accessibilité</a></h2>
      <p>La grille liste chaque critère avec ses tests et la méthode officielle. Marquez chaque critère conforme, non conforme ou non applicable, page par page.</p>
    </li>
    <li class="card">
      <h2><a href="#/rapport">Tout métier : auditer et planifier</a></h2>
      <p>À partir de la grille, obtenez le taux de conformité RGAA, la mention légale à afficher et un calendrier d'actions priorisé, à exporter dans votre agenda (.ics) ou un tableur (CSV).</p>
    </li>
  </ul>
  <h2>Comment s'y prendre</h2>
  <ol class="steps">
    <li>Choisissez un échantillon de pages représentatif : accueil, contact, mentions légales, accessibilité, plan du site, aide, authentification, pages de chaque type et parcours essentiels.</li>
    <li>Lancez le scan automatique sur ces pages et importez le résultat dans la grille.</li>
    <li>Complétez la grille à la main : un outil automatique ne détecte qu'une partie des problèmes.</li>
    <li>Générez le rapport et le calendrier, puis publiez la déclaration d'accessibilité.</li>
  </ol>`;
}
