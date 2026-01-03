import { NextRequest, NextResponse } from 'next/server'
import { chunkText, cleanTextForIndexing, extractTextMetadata } from '@/lib/ai/processors/text-processor'
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings'
import { getAuthClient, authError } from '@/lib/api-utils';

// Route Segment Config (Next.js 14 App Router)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// =====================================================
// POST - PROCESSAR DOCUMENTO
// =====================================================

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  let sourceId: string | null = null

  try {
    const body = await request.json()
    sourceId = body.source_id
    const { file_content, mime_type } = body

    if (!sourceId) {
      return NextResponse.json({ error: 'source_id é obrigatório' }, { status: 400 })
    }

    // Buscar fonte - RLS filtra automaticamente
    const { data: source, error: sourceError } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('id', sourceId)
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
      text = source.text_content || ''
    } else if (source.source_type === 'file' && file_content) {
      text = await extractTextFromFile(file_content, mime_type || source.mime_type)
    } else if (source.source_type === 'url') {
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

    // Inserir chunks no banco - usa organization_id do usuário autenticado
    const chunkRecords = chunks.map((chunk, i) => ({
      organization_id: user.organization_id,
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
      embedding: `[${embeddings[i].join(',')}]`,
    }))

    // Inserir em batches
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
// EXTRAÇÃO DE PDF
// =====================================================

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text
  } catch (e) {
    console.warn('pdf-parse not available, using basic extraction')
    const text = buffer.toString('utf-8')
    const extracted = text.match(/\(([^)]+)\)/g) || []
    return extracted.map(s => s.slice(1, -1)).join(' ')
  }
}

// =====================================================
// EXTRAÇÃO DE DOCX
// =====================================================

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (e) {
    console.warn('mammoth not available, using basic extraction')
    
    try {
      const AdmZip = require('adm-zip')
      const zip = new AdmZip(buffer)
      const docXml = zip.readAsText('word/document.xml')
      return docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    } catch (zipError) {
      throw new Error('Não foi possível extrair texto do DOCX')
    }
  }
}

// =====================================================
// CRAWL DE URL
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
    
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')

    const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''

    text = text.replace(/<[^>]+>/g, ' ')
    
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    text = text.replace(/\s+/g, ' ').trim()

    if (title) {
      text = `${title}\n\n${text}`
    }

    return text
  } catch (error: any) {
    throw new Error(`Erro ao acessar URL: ${error.message}`)
  }
}
