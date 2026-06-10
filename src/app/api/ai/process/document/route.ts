import { NextRequest, NextResponse } from 'next/server'
import { chunkText, cleanTextForIndexing, extractTextMetadata } from '@/lib/ai/processors/text-processor'
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings'
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Route Segment Config (Next.js 14 App Router)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// =====================================================
// P1: rota INTERNA (chamada por sources/upload/reprocess via fetch server-side).
// Sem proteção, qualquer um reprocessa/envenena a base de conhecimento de
// outra org. Mesmo padrão de auth dos crons (Bearer CRON_SECRET).
// =====================================================
function isInternalAuthorized(request: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

// =====================================================
// POST - PROCESSAR DOCUMENTO
// =====================================================

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  let sourceId: string | null = null

  try {
    const body = await request.json()
    sourceId = body.source_id
    const { organization_id, file_content, mime_type } = body

    if (!sourceId || !organization_id) {
      return NextResponse.json({ error: 'source_id e organization_id são obrigatórios' }, { status: 400 })
    }

    // Buscar fonte
    const { data: source, error: sourceError } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('organization_id', organization_id)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Fonte não encontrada' }, { status: 404 })
    }

    // Atualizar status para processing
    await supabase
      .from('ai_agent_sources')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', sourceId)

    console.log(`Processing source ${sourceId} of type ${source.source_type}`)

    // Extrair texto baseado no tipo
    let text = ''

    if (source.source_type === 'text') {
      // Texto direto
      text = source.text_content || ''
    } else if (source.source_type === 'file' && file_content) {
      // Arquivo enviado como base64
      text = await extractTextFromFile(file_content, mime_type || source.mime_type)
    } else if (source.source_type === 'url') {
      // Crawl de URL
      text = await crawlUrl(source.url)
    } else {
      throw new Error(`Tipo de fonte não suportado: ${source.source_type}`)
    }

    if (!text || !text.trim()) {
      throw new Error('Não foi possível extrair texto da fonte')
    }

    // Limpar texto
    const cleanText = cleanTextForIndexing(text)
    const metadata = extractTextMetadata(cleanText)

    console.log(`Extracted ${metadata.word_count} words from source ${sourceId}`)

    // Dividir em chunks
    const chunks = chunkText(cleanText, {
      maxTokens: 500,
      overlap: 50,
    })

    console.log(`Created ${chunks.length} chunks from source ${sourceId}`)

    if (chunks.length === 0) {
      throw new Error('Nenhum chunk gerado do texto')
    }

    // Gerar embeddings
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY não configurada')
    }

    const chunkTexts = chunks.map(c => c.content)
    const embeddings = await generateEmbeddingsBatch(chunkTexts, openaiKey)

    console.log(`Generated ${embeddings.length} embeddings for source ${sourceId}`)

    // Inserir chunks no banco
    const chunkRecords = chunks.map((chunk, i) => ({
      organization_id,
      source_id: sourceId,
      agent_id: source.agent_id,
      content: chunk.content,
      content_tokens: chunk.tokens,
      metadata: {
        ...chunk.metadata,
        index: chunk.index,
        source_name: source.name,
        source_type: source.source_type,
      },
      embedding: `[${embeddings[i].join(',')}]`, // Formato para pgvector
    }))

    // Inserir em batches para evitar timeout
    const batchSize = 50
    for (let i = 0; i < chunkRecords.length; i += batchSize) {
      const batch = chunkRecords.slice(i, i + batchSize)
      
      const { error: insertError } = await supabase
        .from('ai_agent_chunks')
        .insert(batch)

      if (insertError) {
        console.error('Error inserting chunks:', insertError)
        throw insertError
      }
    }

    // Atualizar fonte como ready
    await supabase
      .from('ai_agent_sources')
      .update({
        status: 'ready',
        chunks_count: chunks.length,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', sourceId)

    console.log(`Successfully processed source ${sourceId}`)

    return NextResponse.json({
      success: true,
      source_id: sourceId,
      chunks_count: chunks.length,
      metadata,
    })

  } catch (error: any) {
    console.error('Error processing document:', error)

    // Atualizar fonte com erro
    if (sourceId) {
      await supabase
        .from('ai_agent_sources')
        .update({
          status: 'error',
          error_message: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sourceId)
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// EXTRAÇÃO DE TEXTO DE ARQUIVOS
// =====================================================

async function extractTextFromFile(base64Content: string, mimeType: string): Promise<string> {
  const buffer = Buffer.from(base64Content, 'base64')

  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return buffer.toString('utf-8')
  }

  if (mimeType === 'application/pdf') {
    return await extractTextFromPDF(buffer)
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword') {
    return await extractTextFromDOCX(buffer)
  }

  throw new Error(`Tipo de arquivo não suportado: ${mimeType}`)
}

// =====================================================
// EXTRAÇÃO DE PDF (Simplificada)
// =====================================================

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Extração básica de texto de PDF sem dependências externas
  // Para suporte completo a PDF, instale: npm install pdf-parse
  console.warn('PDF extraction: using basic fallback. For better results, install pdf-parse')

  // Extração muito básica de texto de PDF (não funciona bem para PDFs complexos)
  const text = buffer.toString('utf-8')
  const extracted = text.match(/\(([^)]+)\)/g) || []
  return extracted.map(s => s.slice(1, -1)).join(' ')
}

// =====================================================
// EXTRAÇÃO DE DOCX (Simplificada)
// =====================================================

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  // Extração básica de DOCX sem dependências externas
  // Para suporte completo a DOCX, instale: npm install mammoth adm-zip
  console.warn('DOCX extraction: using basic fallback. For better results, install mammoth')

  // DOCX é um arquivo ZIP - tentar extrair via descompressão básica
  // Isso é uma aproximação muito simples que pode não funcionar em todos os casos
  try {
    const text = buffer.toString('utf-8')
    // Tentar extrair texto entre tags <w:t>
    const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
    const extracted = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ')
    if (extracted.trim()) {
      return extracted.trim()
    }
    throw new Error('Não foi possível extrair texto')
  } catch (e) {
    throw new Error('Não foi possível extrair texto do DOCX. Considere converter para .txt ou instalar as dependências mammoth e adm-zip.')
  }
}

// =====================================================
// CRAWL DE URL (Simplificado)
// =====================================================

async function crawlUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Worder/1.0; +https://worder.com)',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    
    // Extração básica de texto do HTML
    // Remover scripts e styles
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')

    // Extrair título
    const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''

    // Remover todas as tags HTML
    text = text.replace(/<[^>]+>/g, ' ')
    
    // Decodificar entidades HTML
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    // Limpar espaços
    text = text.replace(/\s+/g, ' ').trim()

    // Adicionar título no início se existir
    if (title) {
      text = `${title}\n\n${text}`
    }

    return text
  } catch (error: any) {
    throw new Error(`Erro ao acessar URL: ${error.message}`)
  }
}

