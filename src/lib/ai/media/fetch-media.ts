/**
 * Download da mídia inbound persistida pelo pipeline de mídia
 * (plano 2026-07-27-inbound-media-pipeline): bucket 'whatsapp-media' via
 * media_storage_path, com fallback para media_url (signed/public URL).
 *
 * Cap de tamanho: base64 no payload do LLM e multipart de STT ficam
 * impraticáveis acima disso; mídia grande cai no media_fallback do runner.
 *
 * SSRF (item 19 do audit, achado adjacente do item 18): media_url vem do
 * PROVEDOR (WhatsApp), não do lojista — mas um webhook forjado (ou um
 * provedor comprometido) pode apontar essa URL pra rede interna do mesmo
 * jeito que o endpoint de uma custom tool. safeFetch (ssrf-guard.ts) valida
 * pra onde o host resolve e revalida a cada redirect antes de buscar.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import { safeFetch } from '../ssrf-guard'

export const MAX_INBOUND_MEDIA_BYTES = 10 * 1024 * 1024 // 10MB

const MEDIA_BUCKET = 'whatsapp-media'

export interface FetchedMedia {
  buffer: Buffer
  mimeType: string
}

function withinCap(buffer: Buffer): boolean {
  return buffer.byteLength > 0 && buffer.byteLength <= MAX_INBOUND_MEDIA_BYTES
}

export async function fetchInboundMedia(params: {
  storagePath?: string | null
  mediaUrl?: string | null
  mimeType?: string | null
}): Promise<FetchedMedia | null> {
  const { storagePath, mediaUrl, mimeType } = params

  if (storagePath) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(MEDIA_BUCKET)
        .download(storagePath)
      if (!error && data) {
        const buffer = Buffer.from(await data.arrayBuffer())
        if (withinCap(buffer)) {
          return { buffer, mimeType: mimeType || data.type || 'application/octet-stream' }
        }
        return null
      }
    } catch {
      // storage indisponível => tenta a URL abaixo
    }
  }

  if (mediaUrl) {
    try {
      const response = await safeFetch(mediaUrl)
      if (!response.ok) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!withinCap(buffer)) return null
      return {
        buffer,
        mimeType:
          mimeType || response.headers.get('content-type') || 'application/octet-stream',
      }
    } catch {
      return null
    }
  }

  return null
}
