// Chamada às rotas internas do runtime (bearer = AGENTS_PREVIEW_TOKEN).
// Plano IA M4 passo 26: compartilhado pelas rotas de avaliação.

export class RuntimeNotConfigured extends Error {}

export async function callRuntime(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<{ status: number; payload: any }> {
  const url = process.env.AGENTS_RUNTIME_URL
  const token = process.env.AGENTS_PREVIEW_TOKEN
  if (!url || !token) {
    throw new RuntimeNotConfigured('AGENTS_RUNTIME_URL/AGENTS_PREVIEW_TOKEN não configurados')
  }
  const res = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await res.json().catch(() => ({ error: 'resposta inválida do runtime' }))
  return { status: res.status, payload }
}
