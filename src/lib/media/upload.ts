// =============================================================
// Upload de mídia — vários arquivos de uma vez
//
// A biblioteca e o seletor do editor mandavam UM arquivo por vez: o
// input não tinha `multiple`, o drop lia só files[0], e qualquer erro
// era engolido — a pessoa soltava cinco imagens e via uma aparecer,
// sem saber por quê.
//
// Aqui o lote inteiro é validado antes de sair (tipo e tamanho, com a
// mensagem exata do que foi recusado), sobe com concorrência limitada
// (três de cada vez — o suficiente para ser rápido sem estourar a API)
// e devolve o que subiu e o que falhou, arquivo a arquivo. Quem chama
// mostra o resumo; nada some em silêncio.
// =============================================================

export interface MediaFile {
  id: string
  name: string
  url: string
  size: number
  type: string
  created_at: string
  storage_path: string
  store_id?: string | null
}

export interface UploadFailure {
  name: string
  reason: string
}

export interface UploadResult {
  uploaded: MediaFile[]
  failed: UploadFailure[]
}

export const MEDIA_ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024
export const MEDIA_ACCEPT = MEDIA_ALLOWED_TYPES.join(',')

const CONCURRENCY = 3

/** Recusa antes de gastar rede: o motivo aparece na hora, por arquivo. */
export function validateMediaFile(file: File): string | null {
  if (!MEDIA_ALLOWED_TYPES.includes(file.type)) {
    return 'Tipo não permitido — use JPG, PNG, GIF, WebP ou SVG'
  }
  if (file.size > MEDIA_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return `Arquivo com ${mb} MB — o máximo é 10 MB`
  }
  return null
}

async function uploadOne(file: File, storeId?: string | null): Promise<MediaFile> {
  const form = new FormData()
  form.append('file', file)
  if (storeId) form.append('store_id', storeId)
  const res = await fetch('/api/content/media', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Falha no upload (${res.status})`)
  }
  return data as MediaFile
}

/**
 * Sobe todos os arquivos, três de cada vez. `onProgress` recebe quantos
 * já terminaram (sucesso ou falha) para a tela mostrar "3/7".
 */
export async function uploadMediaFiles(
  files: File[],
  storeId?: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<UploadResult> {
  const uploaded: MediaFile[] = []
  const failed: UploadFailure[] = []
  const fila: File[] = []

  for (const f of files) {
    const motivo = validateMediaFile(f)
    if (motivo) failed.push({ name: f.name, reason: motivo })
    else fila.push(f)
  }

  const total = files.length
  let done = failed.length
  onProgress?.(done, total)

  // Preserva a ordem de escolha no resultado: quem soltou A, B, C quer
  // ver A, B, C, não a ordem em que a rede respondeu.
  const resultados: Array<MediaFile | null> = new Array(fila.length).fill(null)
  let cursor = 0
  const worker = async () => {
    while (cursor < fila.length) {
      const i = cursor++
      const f = fila[i]
      try {
        resultados[i] = await uploadOne(f, storeId)
      } catch (e: any) {
        failed.push({ name: f.name, reason: e?.message || 'Erro de conexão' })
      } finally {
        done++
        onProgress?.(done, total)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, fila.length) }, worker))

  for (const r of resultados) if (r) uploaded.push(r)
  return { uploaded, failed }
}

/** Apaga vários de uma vez. Devolve os caminhos que NÃO foram apagados. */
export async function deleteMediaFiles(paths: string[]): Promise<{ deleted: string[]; failed: string[] }> {
  if (paths.length === 0) return { deleted: [], failed: [] }
  const res = await fetch('/api/content/media', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storage_paths: paths }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { deleted: [], failed: paths }
  return {
    deleted: Array.isArray(data.deleted) ? data.deleted : paths,
    failed: Array.isArray(data.failed) ? data.failed : [],
  }
}

/** Resumo curto para a tela: "3 enviadas · 1 falhou". */
export function summarizeUpload(r: UploadResult): string {
  const partes: string[] = []
  if (r.uploaded.length) partes.push(`${r.uploaded.length} ${r.uploaded.length === 1 ? 'enviada' : 'enviadas'}`)
  if (r.failed.length) partes.push(`${r.failed.length} ${r.failed.length === 1 ? 'falhou' : 'falharam'}`)
  return partes.join(' · ')
}
