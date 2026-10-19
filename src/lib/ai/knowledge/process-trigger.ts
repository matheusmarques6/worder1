// Dispara o processamento assíncrono de uma fonte (chunks + embeddings) pelo
// endpoint interno /api/ai/process/document — o MESMO caminho que a rota
// /api/ai/agents/[id]/sources usa (plano IA M3 passo 19: compartilhado com a
// importação CSV e com a atualização semanal das páginas do site).

export function sourceProcessingOrigin(): string {
  // Preview processing must stay on the candidate revision, rather than a
  // shared alias that may already point at a different commit.
  return process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export async function triggerSourceProcessing(sourceId: string, organizationId: string): Promise<void> {
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
  if (!internalSecret) {
    throw new Error(
      'INTERNAL_API_SECRET (ou CRON_SECRET) não configurado neste ambiente — configure um dos dois (veja .env.example) para processar fontes.',
    )
  }
  const baseUrl = sourceProcessingOrigin()
  const res = await fetch(`${baseUrl}/api/ai/process/document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${internalSecret}` },
    body: JSON.stringify({ source_id: sourceId, organization_id: organizationId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `process/document respondeu ${res.status}`)
  }
}
