/** Métiers responsables d'une correction. */
export type Role = "design" | "dev" | "content";
/** Profils utilisateurs de la boîte à outils. */
export type Persona = "dev" | "design" | "ba" | "auditor";
export type Impact = "bloquant" | "majeur" | "mineur";
export type Effort = 1 | 2 | 3;
export type Automation = "auto" | "semi" | "manuel";
export type WcagLevel = "A" | "AA" | "AAA";

export interface RoleTips {
  design?: string;
  dev?: string;
  content?: string;
}

export interface CriterionGuidance extends RoleTips {
  id: string;
  owners: Role[];
  impact: Impact;
  effort: Effort;
  automation: Automation;
}

export interface Wcag22Criterion extends CriterionGuidance {
  sc: string;
  level: WcagLevel;
  title: string;
  summary: string;
  /** Procédure de test manuelle pour la recette. */
  test: string;
}

export interface CriterionTest {
  /** Identifiant du test, ex. « 1.1.1 ». */
  id: string;
  /** Énoncé du test, en texte brut. */
  text: string;
  /** Méthodologie officielle de test (texte brut, étapes numérotées). */
  methodology?: string;
}

export interface Criterion extends CriterionGuidance {
  source: "RGAA" | "WCAG22";
  topic: { number: number; title: string };
  /** Énoncé du critère en texte brut. */
  title: string;
  tests: CriterionTest[];
  /** Critères de succès WCAG correspondants, ex. « 1.1.1 Non-text Content (A) ». */
  wcag: string[];
  /** Niveau WCAG le plus exigeant parmi les références. */
  level: WcagLevel;
  techniques: string[];
  url: string;
}

/** Statut d'un critère sur une page, selon la méthode RGAA. */
export type Status = "C" | "NC" | "NA" | "NT";
