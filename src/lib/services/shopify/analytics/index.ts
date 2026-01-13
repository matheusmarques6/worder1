// =============================================
// Shopify Analytics - Index
// src/lib/services/shopify/analytics/index.ts
// =============================================

// RFM Analysis
export {
  calculateRFMScores,
  getRFMScores,
  getRFMSummary,
  RFM_SEGMENTS,
  type RFMScore,
  type RFMResult,
} from './rfm';

// Cohort Analysis
export {
  calculateCohortAnalysis,
  getCohortData,
  getCohortMatrix,
  type CohortData,
  type CohortResult,
  type CohortMatrix,
} from './cohort';
