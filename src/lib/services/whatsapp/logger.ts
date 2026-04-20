// =============================================
// WhatsApp Logger Service
// src/lib/services/whatsapp/logger.ts
// =============================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function shouldLog(level: LogLevel): boolean {
  if (IS_PRODUCTION && level === 'debug') return false
  return true
}

function formatMessage(prefix: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${prefix}] ${message}`
}

export const logger = {
  debug(prefix: string, message: string, data?: unknown) {
    if (!shouldLog('debug')) return
    if (data !== undefined) {
      console.debug(formatMessage(prefix, message), data)
    } else {
      console.debug(formatMessage(prefix, message))
    }
  },

  info(prefix: string, message: string, data?: unknown) {
    if (!shouldLog('info')) return
    if (data !== undefined) {
      console.info(formatMessage(prefix, message), data)
    } else {
      console.info(formatMessage(prefix, message))
    }
  },

  warn(prefix: string, message: string, data?: unknown) {
    if (!shouldLog('warn')) return
    if (data !== undefined) {
      console.warn(formatMessage(prefix, message), data)
    } else {
      console.warn(formatMessage(prefix, message))
    }
  },

  error(prefix: string, message: string, data?: unknown) {
    if (!shouldLog('error')) return
    if (data !== undefined) {
      console.error(formatMessage(prefix, message), data)
    } else {
      console.error(formatMessage(prefix, message))
    }
  },
}
