export * from "./types.js";
export { stripMarkdown } from "./text.js";
export {
  RGAA_VERSION,
  WCAG_VERSION,
  getCriteria,
  getCriterion,
  getTopics,
  criteriaForAxeRule,
  axeRulesForCriterion,
  mappedAxeRules,
  adviceFor,
  type CriteriaFilter,
} from "./referential.js";
export {
  computeCompliance,
  consolidate,
  legalStatusFor,
  type PageAudit,
  type ComplianceReport,
  type Counts,
  type LegalStatus,
} from "./compliance.js";
export {
  buildActionPlan,
  findingsFromReport,
  planToIcs,
  planToCsv,
  type Finding,
  type PlanOptions,
  type ActionItem,
  type ActionPlan,
} from "./planning.js";
