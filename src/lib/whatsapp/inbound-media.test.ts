import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDownloadMedia = vi.fn()
vi.mock('./cloud-api', () => ({
  createWhatsAppCloudClient: vi.fn(() => ({ downloadMedia: mockDownloadMedia })),
}))
vi.mock('./account-loader', () => ({
  getAccessToken: vi.fn(() => 'token-123'),
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Estado mutável que o mock do supabase-admin devolve por tabela.
const rows: { message: any; account: any } = { message: null, account: null }
const mockUpdate = vi.fn()
const mockUpload = vi.fn()
const mockCreateSignedUrl = vi.fn()

// Controla o resultado do .update(...).eq(...) do mock do Supabase, para
// exercitar os caminhos onde a própria persistência falha (ver testes de
// "persist_failed" e "mark-failed também falha" abaixo).
type UpdateEqBehavior = 'ok' | 'error' | 'throw'
const updateEqBehavior: { mode: UpdateEqBehavior } = { mode: 'ok' }

// Controla o `error` devolvido pelo .select(...).eq(...).maybeSingle() do mock,
// por tabela, para exercitar o caminho de leitura transitoriamente falha
// (ver teste "db_read_failed" abaixo). null = comportamento padrão (sem erro).
const selectErrorBehavior: { message: any; account: any } = { message: null, account: null }

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'whatsapp_cloud_messages' ? rows.message : rows.account,
            error: table === 'whatsapp_cloud_messages' ? selectErrorBehavior.message : selectErrorBehavior.account,
          }),
        }),
      }),
      update: (values: any) => {
        mockUpdate(table, values)
        return {
          eq: async () => {
            if (updateEqBehavior.mode === 'throw') throw new Error('db update boom')
            if (updateEqBehavior.mode === 'error') return { error: { message: 'update failed' } }
            return { error: null }
          },
        }
      },
    }),
    storage: {
      from: () => ({
        upload: (...args: any[]) => mockUpload(...args),
        createSignedUrl: (...args: any[]) => mockCreateSignedUrl(...args),
      }),
    },
  },
}))

import { processInboundMedia, extensionFromMime, buildStoragePath } from './inbound-media'

const JOB = { cloudMessageId: 'msg-1', accountId: 'acc-1', organizationId: 'org-1' }

describe('extensionFromMime', () => {
  it('mapeia MIMEs conhecidos do WhatsApp', () => {
    expect(extensionFromMime('image/jpeg')).toBe('jpg')
    expect(extensionFromMime('audio/ogg')).toBe('ogg')
    expect(extensionFromMime('application/pdf')).toBe('pdf')
  })
  it('ignora sufixo de codecs (Meta manda "audio/ogg; codecs=opus")', () => {
    expect(extensionFromMime('audio/ogg; codecs=opus')).toBe('ogg')
  })
  it('cai para o subtipo do MIME e por fim para bin', () => {
    expect(extensionFromMime('image/tiff')).toBe('tiff')
    expect(extensionFromMime('')).toBe('bin')
  })
})

describe('buildStoragePath', () => {
  it('monta org/conversation/messageId.ext (mesmo layout do envio outbound)', () => {
    expect(buildStoragePath('org-1', 'conv-1', 'msg-1', 'image/jpeg'))
      .toBe('org-1/conv-1/msg-1.jpg')
  })
})

describe('processInboundMedia', () => {
  beforeEach(() => {
    mockDownloadMedia.mockReset()
    mockUpdate.mockReset()
    mockUpload.mockReset()
    mockCreateSignedUrl.mockReset()
    rows.message = {
      id: 'msg-1',
      media_id: 'meta-media-9',
      conversation_id: 'conv-1',
      message_type: 'image',
      content: { image: { id: 'meta-media-9', mime_type: 'image/jpeg' } },
      media_download_status: 'pending',
    }
    rows.account = { id: 'acc-1', phone_number_id: 'pn-1', access_token: 'raw-token' }
    mockUpload.mockResolvedValue({ error: null })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null })
    updateEqBehavior.mode = 'ok'
    selectErrorBehavior.message = null
    selectErrorBehavior.account = null
  })

  it('baixa da Meta, sobe pro Storage e persiste media_url/storage_path/mime/filename + done', async () => {
    mockDownloadMedia.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' })

    const result = await processInboundMedia(JOB)

    expect(result.ok).toBe(true)
    expect(mockDownloadMedia).toHaveBeenCalledWith('meta-media-9')
    expect(mockUpload).toHaveBeenCalledWith(
      'org-1/conv-1/msg-1.jpg',
      expect.anything(),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    )
    expect(mockUpdate).toHaveBeenCalledWith('whatsapp_cloud_messages', expect.objectContaining({
      media_url: 'https://signed.example/x',
      media_storage_path: 'org-1/conv-1/msg-1.jpg',
      media_mime_type: 'image/jpeg',
      media_filename: 'image-msg-1.jpg',
      media_download_status: 'done',
    }))
  })

  it('usa o filename original quando a mensagem é documento', async () => {
    rows.message.message_type = 'document'
    rows.message.content = { document: { id: 'meta-media-9', filename: 'nota-fiscal.pdf' } }
    mockDownloadMedia.mockResolvedValue({ data: new Uint8Array([1]), mimeType: 'application/pdf' })

    await processInboundMedia(JOB)

    expect(mockUpdate).toHaveBeenCalledWith('whatsapp_cloud_messages', expect.objectContaining({
      media_filename: 'nota-fiscal.pdf',
    }))
  })

  it('falha de download NÃO lança: marca media_download_status=failed e resolve', async () => {
    mockDownloadMedia.mockRejectedValue(new Error('meta 401'))

    const result = await processInboundMedia(JOB)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('meta 401')
    expect(mockUpdate).toHaveBeenCalledWith('whatsapp_cloud_messages', expect.objectContaining({
      media_download_status: 'failed',
    }))
  })

  it('é idempotente: status done pula download (retry do QStash vira no-op)', async () => {
    rows.message.media_download_status = 'done'
    const result = await processInboundMedia(JOB)
    expect(result).toEqual({ ok: true, reason: 'already_done' })
    expect(mockDownloadMedia).not.toHaveBeenCalled()
  })

  it('mensagem sem media_id retorna no_media_id sem tocar Storage', async () => {
    rows.message.media_id = null
    const result = await processInboundMedia(JOB)
    expect(result).toEqual({ ok: false, reason: 'no_media_id' })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('update final (persistência) falha: NÃO lança, retorna persist_failed', async () => {
    mockDownloadMedia.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' })
    updateEqBehavior.mode = 'error'

    const result = await processInboundMedia(JOB)

    expect(result).toEqual({ ok: false, reason: 'persist_failed' })
  })

  it('update de media_download_status=failed também falha: NÃO lança, ainda resolve com o motivo original', async () => {
    mockDownloadMedia.mockRejectedValue(new Error('meta 401'))
    updateEqBehavior.mode = 'throw'

    const result = await processInboundMedia(JOB)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('meta 401')
  })

  it('erro transitório ao ler a mensagem NÃO lança e retorna db_read_failed (retryável, diferente de message_not_found)', async () => {
    selectErrorBehavior.message = { message: 'connection reset' }

    const result = await processInboundMedia(JOB)

    expect(result).toEqual({ ok: false, reason: 'db_read_failed' })
    expect(mockDownloadMedia).not.toHaveBeenCalled()
  })
})
