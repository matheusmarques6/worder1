// Testes de integração: pdf-parse e mammoth REAIS (sem vi.mock).
// Mantidos em arquivo separado do unit test porque os mocks de lá
// são hoisted para o módulo inteiro.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { extractTextFromFile } from './file-extractor'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// PDF mínimo válido construído inline (PDF é formato textual).
// Sem tabela xref: o pdf.js (motor do pdf-parse) reconstrói o índice
// de objetos via recovery scan quando o xref está ausente/quebrado.
const MINIMAL_PDF = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
  '4 0 obj<</Length 58>>stream',
  'BT /F1 18 Tf 36 740 Td (Worder fixture PDF de teste) Tj ET',
  'endstream',
  'endobj',
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  'trailer<</Root 1 0 R/Size 6>>',
  '%%EOF',
].join('\n')

describe('file-extractor (integração, libs reais)', () => {
  it('extrai texto de um PDF mínimo real com pdf-parse', async () => {
    const b64 = Buffer.from(MINIMAL_PDF, 'latin1').toString('base64')
    const text = await extractTextFromFile(b64, 'application/pdf')
    expect(text).toContain('Worder fixture PDF de teste')
  })

  it('extrai texto de um DOCX mínimo real com mammoth', async () => {
    const fixture = readFileSync(
      join(__dirname, '..', '__tests__', 'fixtures', 'minimal.docx')
    )
    const text = await extractTextFromFile(fixture.toString('base64'), DOCX_MIME)
    expect(text).toContain('Worder fixture DOCX para teste de extracao real')
  })

  it('DOCX fixture NÃO seria extraível pelo fallback regex (prova de valor)', () => {
    // O zip comprime word/document.xml — o regex <w:t> sobre o binário
    // cru (método antigo) não encontra nada. mammoth é necessário.
    const fixture = readFileSync(
      join(__dirname, '..', '__tests__', 'fixtures', 'minimal.docx')
    )
    const raw = fixture.toString('utf-8')
    expect(raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)).toBeNull()
  })
})
