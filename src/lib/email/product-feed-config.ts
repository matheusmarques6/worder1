// Validação da configuração de um feed de produtos, compartilhada pelas
// rotas de criar e editar. Fora do route.ts de propósito: um route file do
// App Router só pode exportar handlers e config — exportar helper dali
// quebra o build.

/**
 * Lista de produtos excluídos vinda do cliente: só ids de verdade, sem
 * repetição e com teto — a lista vive numa coluna, não é um depósito.
 * O formato restrito também é o que deixa o id seguro no filtro `in`
 * do PostgREST lá na resolução do feed.
 */
export function normalizeExcluded(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const id = String(v ?? '').trim()
    if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) continue
    if (!out.includes(id)) out.push(id)
    if (out.length >= 500) break
  }
  return out
}
