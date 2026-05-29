// =============================================
// Structured logger para hot paths do WhatsApp.
// Emite uma linha JSON por evento — fácil de filtrar
// no Vercel logs / Datadog / Grafana Loki.
// =============================================

type LogData = Record<string, unknown>

function emit(level: 'info' | 'warn' | 'error', event: string, data: LogData) {
  const line = JSON.stringify({
    level,
    event,
    ...data,
    ts: new Date().toISOString(),
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const wlog = {
  info: (event: string, data: LogData = {}) => emit('info', event, data),
  warn: (event: string, data: LogData = {}) => emit('warn', event, data),
  error: (event: string, data: LogData = {}) => emit('error', event, data),
}
