// Telemetria do Next.js (plano IA M5 passo 30). Liga o OpenTelemetry pelo
// @vercel/otel SOMENTE quando há destino configurado — o mesmo Logfire do
// runtime, via as variáveis padrão OTLP:
//
//   OTEL_EXPORTER_OTLP_ENDPOINT=https://logfire-api.pydantic.dev
//   OTEL_EXPORTER_OTLP_HEADERS=Authorization=<write token do Logfire>
//
// Sem a variável, não registra nada (dev, preview e testes ficam iguais).
// As rotas e os fetch saem como spans; o nó action_ai_mission propaga o
// traceparent até o runtime (src/lib/obs/trace-carrier.ts).

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return
  const { registerOTel } = await import('@vercel/otel')
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME || 'worder-web' })
}
