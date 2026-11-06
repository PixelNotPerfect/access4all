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
