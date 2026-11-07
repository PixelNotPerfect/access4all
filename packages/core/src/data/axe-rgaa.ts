/**
 * Correspondance entre les règles axe-core et les critères RGAA 4.1.2
 * (ou les critères WCAG 2.2 absents du RGAA, préfixés « WCAG- »).
 *
 * Point de départ : la table AXE_RULE_TO_RGAA_CRITERION d'acces-cible
 * (betagouv/acces-cible, licence MIT), élargie à l'ensemble des règles axe
 * pertinentes. Une règle axe ne valide jamais un critère RGAA à elle seule :
 * une violation prouve la non-conformité, un succès demande une vérification manuelle.
 */
export const axeToRgaa: Record<string, string[]> = {
  // Images
  "image-alt": ["1.1"],
  "input-image-alt": ["1.1"],
  "area-alt": ["1.1"],
  "role-img-alt": ["1.1"],
  "svg-img-alt": ["1.1"],
  "object-alt": ["1.1"],
  "server-side-image-map": ["1.1"],
  "image-redundant-alt": ["1.3"],
  "presentation-role-conflict": ["1.2"],
  // Cadres
  "frame-title": ["2.1"],
  "frame-title-unique": ["2.2"],
  // Couleurs
  "color-contrast": ["3.2"],
  "link-in-text-block": ["10.6"],
  // Multimédia
  "video-caption": ["4.3"],
  "no-autoplay-audio": ["4.10"],
  // Tableaux
  "table-fake-caption": ["5.4"],
  "td-has-header": ["5.7"],
  "td-headers-attr": ["5.7"],
  "th-has-data-cells": ["5.6"],
  "scope-attr-valid": ["5.7"],
  "table-duplicate-name": ["5.5"],
  // Liens
  "link-name": ["6.2"],
  "identical-links-same-purpose": ["6.1"],
  "label-content-name-mismatch": ["6.1", "11.2"],
  // Scripts / ARIA
  "aria-allowed-attr": ["7.1"],
  "aria-allowed-role": ["7.1"],
  "aria-braille-equivalent": ["7.1"],
  "aria-command-name": ["7.1"],
  "aria-conditional-attr": ["7.1"],
  "aria-deprecated-role": ["7.1"],
  "aria-dialog-name": ["7.1"],
  "aria-hidden-body": ["7.1"],
  "aria-input-field-name": ["7.1"],
  "aria-meter-name": ["7.1"],
  "aria-progressbar-name": ["7.1"],
  "aria-prohibited-attr": ["7.1"],
  "aria-required-attr": ["7.1"],
  "aria-required-children": ["7.1"],
  "aria-required-parent": ["7.1"],
  "aria-roles": ["7.1"],
  "aria-text": ["7.1"],
  "aria-toggle-field-name": ["7.1"],
  "aria-tooltip-name": ["7.1"],
  "aria-treeitem-name": ["7.1"],
  "aria-valid-attr": ["7.1"],
  "aria-valid-attr-value": ["7.1"],
  "nested-interactive": ["7.1"],
  "summary-name": ["7.1"],
  "scrollable-region-focusable": ["7.3"],
  "frame-focusable-content": ["7.3"],
  // Éléments obligatoires
  "duplicate-id-aria": ["8.2"],
  "html-has-lang": ["8.3"],
  "html-lang-valid": ["8.4"],
  "html-xml-lang-mismatch": ["8.4"],
  "document-title": ["8.5"],
  "valid-lang": ["8.8"],
  // Structuration
  "empty-heading": ["9.1"],
  "heading-order": ["9.1"],
  "page-has-heading-one": ["9.1"],
  "list": ["9.3"],
  "listitem": ["9.3"],
  "definition-list": ["9.3"],
  "dlitem": ["9.3"],
  "landmark-one-main": ["9.2", "12.6"],
  "landmark-no-duplicate-banner": ["9.2", "12.6"],
  "landmark-no-duplicate-contentinfo": ["9.2", "12.6"],
  "landmark-no-duplicate-main": ["9.2", "12.6"],
  "landmark-banner-is-top-level": ["12.6"],
  "landmark-contentinfo-is-top-level": ["12.6"],
  "landmark-main-is-top-level": ["12.6"],
  "landmark-complementary-is-top-level": ["12.6"],
  "landmark-unique": ["12.6"],
  "region": ["12.6"],
  // Présentation
  "meta-viewport": ["10.4"],
  "meta-viewport-large": ["10.4"],
  "avoid-inline-spacing": ["10.12"],
  "aria-hidden-focus": ["10.8"],
  // Formulaires
  "label": ["11.1"],
  "select-name": ["11.1"],
  "form-field-multiple-labels": ["11.1"],
  "label-title-only": ["11.1"],
  "button-name": ["11.9"],
  "input-button-name": ["11.9"],
  "autocomplete-valid": ["11.13"],
  // Navigation
  "bypass": ["12.7"],
  "skip-link": ["12.7"],
  "tabindex": ["12.8"],
  "accesskeys": ["12.10"],
  // Consultation
  "meta-refresh": ["13.1"],
  "meta-refresh-no-exceptions": ["13.1"],
  "blink": ["13.8"],
  "marquee": ["13.8"],
  "css-orientation-lock": ["13.9"],
  // WCAG 2.2 (hors RGAA 4.1.2)
  "target-size": ["WCAG-2.5.8"],
};

/**
 * Tests complémentaires d'access4all (préfixe « a4a- »), exécutés dans le navigateur
 * en plus d'axe-core : navigation au clavier, zoom, reflow, espacement du texte,
 * analyse du DOM et des feuilles de styles. Ils couvrent des critères qu'axe-core
 * ne sait pas tester. Ces identifiants ne sont jamais transmis à axe-core.
 */
export const a4aToRgaa: Record<string, string[]> = {
  // Images
  "a4a-alt-suspect": ["1.3"],
  "a4a-svg-sans-statut": ["1.2"],
  // Scripts
  "a4a-clic-non-focusable": ["7.3"],
  "a4a-changement-contexte-focus": ["7.4"],
  "a4a-select-onchange": ["7.4"],
  "a4a-statut-absent": ["7.5"],
  // Éléments obligatoires
  "a4a-id-duplique": ["8.2"],
  "a4a-titre-page-generique": ["8.6"],
  "a4a-titre-page-duplique": ["8.6"],
  "a4a-balise-presentation": ["8.9"],
  // Structuration
  "a4a-faux-titre": ["9.1"],
  "a4a-zones-manquantes": ["9.2", "12.6"],
  // Présentation
  "a4a-attribut-presentation": ["10.1"],
  "a4a-contenu-css": ["10.2"],
  "a4a-ordre-css": ["10.3"],
  "a4a-zoom-texte-coupe": ["10.4"],
  "a4a-couleurs-css": ["10.5"],
  "a4a-focus-invisible": ["10.7"],
  "a4a-focus-element-cache": ["10.7"],
  "a4a-forme-position": ["10.10"],
  "a4a-reflow": ["10.11"],
  "a4a-espacement-texte": ["10.12"],
  "a4a-infobulle-non-masquable": ["10.13"],
  "a4a-survol-seul": ["10.14"],
  // Formulaires
  "a4a-groupe-sans-fieldset": ["11.5"],
  "a4a-groupe-sans-legende": ["11.6"],
  "a4a-bouton-generique": ["11.9"],
  "a4a-bouton-nom-visible": ["11.9"],
  "a4a-champ-obligatoire": ["11.10"],
  "a4a-autocomplete-manquant": ["11.13"],
  // Navigation
  "a4a-navigation-inconstante": ["12.2"],
  "a4a-lien-evitement": ["12.7"],
  "a4a-ordre-tabulation": ["12.8"],
  "a4a-piege-clavier": ["12.9"],
  // Consultation
  "a4a-animation": ["13.8"],
  "a4a-orientation": ["13.9"],
  "a4a-glisser": ["13.10", "WCAG-2.5.7"],
  // WCAG 2.2
  "a4a-focus-masque": ["WCAG-2.4.11"],
};
