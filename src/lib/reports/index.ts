/**
 * Sistema de Relatórios PDF - Worder CRM
 * 
 * Módulo para geração de relatórios em PDF usando @react-pdf/renderer
 */

// Assets
export { WORDER_LOGO_BASE64 } from './assets/logo'

// Constantes e configuração
export {
  REPORT_LIMITS,
  REPORT_MESSAGES,
  COLORS,
  PERIOD_OPTIONS,
  REPORT_TYPES,
  ADS_PLATFORMS,
  type ReportType,
  type AdsPlatform,
} from './constants'

// Estilos
export {
  SPACING,
  FONT_SIZES,
  baseStyles,
  reportStyles,
} from './styles'

// Utilitários
export {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatDate,
  formatDateTime,
  formatReportPeriod,
  safeText,
  truncateText,
  formatChange,
  generateReportFilename,
  calculatePeriodDates,
  calculateChange,
  calculatePreviousPeriod,
  formatDays,
  formatROAS,
} from './utils'

// Contratos (tipos)
export * from './contracts'

// Render helpers
export {
  generatePdfBuffer,
  generatePdf,
  bufferToUint8Array,
  pdfResponse,
  errorResponse,
  ReportErrors,
} from './render'

// Autenticação
export {
  validateReportAccess,
  getDefaultStoreId,
  parseReportParams,
  type ReportAccessResult,
} from './auth'

