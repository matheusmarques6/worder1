import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks ANTES do import — vitest hoist. Os imports das libs são dinâmicos
// dentro das funções, então vi.mock intercepta na resolução.
vi.mock('pdf-parse/lib/pdf-parse.js', () => ({
  default: vi.fn(async () => ({ text: 'texto extraído do pdf' })),
}))
vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn(async () => ({ value: 'texto extraído do docx' })) },
  extractRawText: vi.fn(async () => ({ value: 'texto extraído do docx' })),
}))

import { extractTextFromFile } from './file-extractor'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('extractTextFromFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('text/plain: decodifica utf-8 direto', async () => {
    const b64 = Buffer.from('olá mundo', 'utf-8').toString('base64')
    expect(await extractTextFromFile(b64, 'text/plain')).toBe('olá mundo')
  })

  it('text/csv: decodifica utf-8 direto', async () => {
    const b64 = Buffer.from('a,b\n1,2', 'utf-8').toString('base64')
    expect(await extractTextFromFile(b64, 'text/csv')).toBe('a,b\n1,2')
  })

  it('pdf: usa pdf-parse', async () => {
    const b64 = Buffer.from('%PDF-1.4 fake').toString('base64')
    expect(await extractTextFromFile(b64, 'application/pdf')).toBe('texto extraído do pdf')
  })

  it('docx: usa mammoth', async () => {
    const b64 = Buffer.from('PK fake zip').toString('base64')
    expect(await extractTextFromFile(b64, DOCX_MIME)).toBe('texto extraído do docx')
  })

  it('pdf: cai no fallback regex quando pdf-parse lança', async () => {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as any
    pdfParse.mockRejectedValueOnce(new Error('corrupt'))
    const b64 = Buffer.from('stream (Hello) (World) endstream').toString('base64')
    const out = await extractTextFromFile(b64, 'application/pdf')
    expect(out).toContain('Hello')
    expect(out).toContain('World')
  })

  it('pdf: cai no fallback quando pdf-parse retorna texto vazio (escaneado)', async () => {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as any
    pdfParse.mockResolvedValueOnce({ text: '   ' })
    const b64 = Buffer.from('(Fallback)').toString('base64')
    expect(await extractTextFromFile(b64, 'application/pdf')).toContain('Fallback')
  })

  it('pdf: lança erro claro quando nem o fallback acha texto', async () => {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as any
    pdfParse.mockRejectedValueOnce(new Error('corrupt'))
    const b64 = Buffer.from('sem parenteses aqui').toString('base64')
    await expect(extractTextFromFile(b64, 'application/pdf')).rejects.toThrow(/PDF/)
  })

  it('docx: cai no fallback regex <w:t> quando mammoth lança', async () => {
    const mammoth = (await import('mammoth')) as any
    mammoth.extractRawText.mockRejectedValueOnce(new Error('bad zip'))
    if (mammoth.default?.extractRawText) {
      mammoth.default.extractRawText.mockRejectedValueOnce(new Error('bad zip'))
    }
    const b64 = Buffer.from('<w:t>Olá</w:t><w:t xml:space="preserve"> Mundo</w:t>').toString('base64')
    const out = await extractTextFromFile(b64, DOCX_MIME)
    expect(out).toContain('Olá')
    expect(out).toContain('Mundo')
  })

  it('mime desconhecido: lança erro', async () => {
    await expect(
      extractTextFromFile(Buffer.from('x').toString('base64'), 'image/png')
    ).rejects.toThrow(/não suportado/)
  })
})
