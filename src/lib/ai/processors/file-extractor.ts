// =============================================
// Extração de texto de arquivos (PDF/DOCX/TXT/CSV) para a base de
// conhecimento dos Agentes IA.
//
// pdf-parse + mammoth com fallback regex (comportamento anterior do
// process/document) quando o parser falha ou não acha texto.
//
// NOTA: importar 'pdf-parse/lib/pdf-parse.js' (NUNCA 'pdf-parse') —
// o index do pacote tem código de debug que tenta ler um arquivo de
// teste local e quebra em produção. Declaração de tipos em
// src/types/pdf-parse-lib.d.ts.
//
// Imports dinâmicos: as libs só carregam quando um PDF/DOCX é
// processado (zero custo de cold start nas demais rotas). Ambas estão
// em serverComponentsExternalPackages no next.config.js.
// =============================================

export async function extractTextFromFile(
  base64Content: string,
  mimeType: string
): Promise<string> {
  const buffer = Buffer.from(base64Content, 'base64')

  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return buffer.toString('utf-8')
  }
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(buffer)
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return extractTextFromDOCX(buffer)
  }
  throw new Error(`Tipo de arquivo não suportado: ${mimeType}`)
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    // pdf.js 1.10.100 (embutido no pdf-parse v1.1.4) falha com "bad XRef entry"
    // para qualquer Node Buffer no Node 22. Converter para Uint8Array independente
    // (cópia de memória própria, sem prototype de Buffer) resolve o problema.
    const data = new Uint8Array(buffer.byteLength)
    data.set(buffer)
    const result = await pdfParse(data as unknown as Buffer)
    if (result?.text?.trim()) return result.text
    console.warn('[file-extractor] pdf-parse retornou texto vazio (PDF escaneado?), tentando fallback')
  } catch (e: any) {
    console.warn('[file-extractor] pdf-parse falhou, usando fallback regex:', e?.message)
  }
  // Fallback: extração ingênua (comportamento anterior do route)
  const raw = buffer.toString('utf-8')
  const extracted = raw.match(/\(([^)]+)\)/g) || []
  const text = extracted.map((s) => s.slice(1, -1)).join(' ')
  if (!text.trim()) {
    throw new Error('Não foi possível extrair texto do PDF (arquivo corrompido ou sem camada de texto)')
  }
  return text
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammothMod: any = await import('mammoth')
    const extractRawText = mammothMod.extractRawText || mammothMod.default?.extractRawText
    const result = await extractRawText({ buffer })
    if (result?.value?.trim()) return result.value
    console.warn('[file-extractor] mammoth retornou texto vazio, tentando fallback')
  } catch (e: any) {
    console.warn('[file-extractor] mammoth falhou, usando fallback regex:', e?.message)
  }
  // Fallback: regex sobre o XML cru (só funciona se o zip não comprimir o XML)
  const raw = buffer.toString('utf-8')
  const matches = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
  const text = matches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ').trim()
  if (!text) {
    throw new Error('Não foi possível extrair texto do DOCX (arquivo corrompido?)')
  }
  return text
}
