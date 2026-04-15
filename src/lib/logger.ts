// =============================================
// WORDER: Structured logger
// /src/lib/logger.ts
//
// Substituto de console.* — em produção remove debug/info automaticamente
// (via next.config removeConsole), mas também permite JSON estruturado
// quando LOG_FORMAT=json.
// =============================================

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Level[] = ['debug', 'info', 'warn', 'error']
const CURRENT_LEVEL = (process.env.LOG_LEVEL as Level) || 'info'
const currentIndex = LEVELS.indexOf(CURRENT_LEVEL)
const USE_JSON = process.env.LOG_FORMAT === 'json'

function format(level: Level, scope: string, msg: string, meta?: Record<string, unknown>) {
  if (USE_JSON) {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      msg,
      ...meta,
    })
  }
  const tag = `[${scope}]`
  return meta ? `${tag} ${msg} ${JSON.stringify(meta)}` : `${tag} ${msg}`
}

function shouldLog(level: Level): boolean {
  return LEVELS.indexOf(level) >= currentIndex
}

function emit(level: Level, scope: string, msg: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return
  const line = format(level, scope, msg, meta)
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', scope, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit('info', scope, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', scope, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', scope, msg, meta),
  }
}

export const logger = createLogger('worder')
