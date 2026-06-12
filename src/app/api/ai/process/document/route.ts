import { NextRequest, NextResponse } from 'next/server'
import { chunkText, cleanTextForIndexing, extractTextMetadata } from '@/lib/ai/processors/text-processor'
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings'
import { resolveEmbeddingKey } from '@/lib/ai/embedding-key'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkAiBudget } from '@/lib/ai/budget';
import { extractTextFromFile } from '@/lib/ai/processors/file-extractor'
import { extractStoragePathFromFileUrl, AI_SOURCES_BUCKET } from '@/lib/ai/source-storage'
import { crawlSite } from '@/lib/ai/crawler'

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

    // Verificação de orçamento (soft gate): se excedido, marca fonte como erro
    // com mensagem de budget em vez de processar embeddings (custo desnecessário).
    // Fail-open: erro de DB no checkAiBudget nunca bloqueia o fluxo.
    const budgetCheck = await checkAiBudget(organization_id, { skipCache: false })
    if (!budgetCheck.allowed) {
      const budgetMsg = `Orçamento AI excedido: $${budgetCheck.spentUsd.toFixed(4)} de $${budgetCheck.budgetUsd?.toFixed(4)} USD/mês`
      if (sourceId) {
        await supabase
          .from('ai_agent_sources')
          .update({
            status: 'error',
            error_message: budgetMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sourceId)
      }
      return NextResponse.json({ error: budgetMsg, code: 'AI_BUDGET_EXCEEDED' }, { status: 402 })
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
    } else if (source.source_type === 'file') {
      let contentBase64: string | undefined = file_content
      if (!contentBase64) {
        // Reprocess: o body não traz o arquivo — baixar o original do storage.
        const storagePath = extractStoragePathFromFileUrl(source.file_url)
        if (!storagePath) {
          throw new Error(
            'Arquivo original não está arquivado no storage. Exclua esta fonte e envie o arquivo novamente.'
          )
        }
        const { data: blob, error: downloadError } = await supabase.storage
          .from(AI_SOURCES_BUCKET)
          .download(storagePath)
        if (downloadError || !blob) {
          throw new Error(
            `Falha ao baixar o arquivo original do storage: ${downloadError?.message || 'arquivo não encontrado'}`
          )
        }
        contentBase64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      }
      text = await extractTextFromFile(contentBase64, mime_type || source.mime_type)
    } else if (source.source_type === 'url') {
      // Crawl de URL
      text = await crawlSite(source.url)
    } else {
      // Nota: source_type='products' pode ser criado por sources/route.ts mas
      // nunca foi suportado aqui (gap pré-existente, fora do escopo deste plano).
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

    // Gerar embeddings (BYO total, Onda 13.6: chave OpenAI da propria org).
    const openaiKey = await resolveEmbeddingKey(supabase, organization_id)
    if (!openaiKey) {
      throw new Error(
        'Chave OpenAI nao configurada na org. Cadastre em Configurações > API Keys para processar bases de conhecimento.'
      )
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


