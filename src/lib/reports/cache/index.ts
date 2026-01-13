/**
 * Report Cache Module
 * Exporta todos os helpers de cache
 */

export {
  makeReportCacheKey,
  getReportCache,
  setReportCache,
  invalidateReportCache,
  isReportCacheAvailable,
  REPORT_CACHE_TTLS,
} from './reportCache'

export {
  withReportCache,
  shouldSkipCache,
  addCacheHeader,
} from './withCache'
