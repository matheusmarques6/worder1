// O carrier W3C do span ativo, no formato que o runtime lê em
// `p_otel` / `job.otel` (agents_runtime.obs.carrier). Sem OpenTelemetry
// registrado (src/instrumentation.ts) ou sem span ativo, devolve null — o
// runtime então abre o seu próprio trace, como antes.

import { context, propagation, trace } from '@opentelemetry/api'

export function currentTraceCarrier(): Record<string, string> | null {
  try {
    if (!trace.getActiveSpan()) return null
    const carrier: Record<string, string> = {}
    propagation.inject(context.active(), carrier)
    return carrier.traceparent ? carrier : null
  } catch {
    return null
  }
}
