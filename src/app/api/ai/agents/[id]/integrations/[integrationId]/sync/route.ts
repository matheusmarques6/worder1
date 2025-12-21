import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chunkText } from '@/lib/ai/processors/text-processor'
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings'

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase não configurado')
  }

  return createClient(url, key)
}

// =====================================================
// POST - SINCRONIZAR PRODUTOS
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; integrationId: string } }
) {
  try {
    const supabase = getSupabase()
    const { id: agentId, integrationId } = params
    const body = await request.json()

    const { organization_id } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Buscar integração
    const { data: integration, error: intError } = await supabase
      .from('ai_agent_integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (intError || !integration) {
      return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 })
    }

    // Atualizar status para syncing
    await supabase
      .from('ai_agent_integrations')
      .update({ sync_status: 'syncing', updated_at: new Date().toISOString() })
      .eq('id', integrationId)

    // Buscar produtos da integração
    let products: any[] = []
    
    try {
      products = await fetchProducts(supabase, organization_id, integration)
    } catch (fetchError: any) {
      await supabase
        .from('ai_agent_integrations')
        .update({ 
          sync_status: 'error', 
          sync_error: fetchError.message,
          updated_at: new Date().toISOString() 
        })
        .eq('id', integrationId)
      
      throw fetchError
    }

    console.log(`Syncing ${products.length} products for integration ${integrationId}`)

    // Formatar produtos para texto
    const productTexts = products.map(p => formatProductForEmbedding(p, integration))

    // Buscar ou criar fonte de produtos
    let sourceId = integration.source_id
    
    if (!sourceId) {
      const { data: source } = await supabase
        .from('ai_agent_sources')
        .insert({
          organization_id,
          agent_id: agentId,
          source_type: 'products',
          name: `Produtos ${integration.integration_type}`,
          integration_id: integrationId,
          integration_type: integration.integration_type,
          status: 'processing',
          chunks_count: 0,
        })
        .select()
        .single()

      if (source) {
        sourceId = source.id
        await supabase
          .from('ai_agent_integrations')
          .update({ source_id: sourceId })
          .eq('id', integrationId)
      }
    }

    if (!sourceId) {
      throw new Error('Não foi possível criar fonte de produtos')
    }

    // Limpar chunks antigos
    await supabase
      .from('ai_agent_chunks')
      .delete()
      .eq('source_id', sourceId)

    // Gerar embeddings
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY não configurada')
    }

    const embeddings = await generateEmbeddingsBatch(productTexts, openaiKey)

    // Inserir chunks
    const chunks = productTexts.map((text, i) => ({
      organization_id,
      source_id: sourceId,
      agent_id: agentId,
      content: text,
      content_tokens: Math.ceil(text.length / 4),
      metadata: {
        product_id: products[i].id,
        product_name: products[i].title || products[i].name,
        product_type: 'e-commerce',
        source_type: integration.integration_type,
      },
      embedding: `[${embeddings[i].join(',')}]`,
    }))

    // Inserir em batches
    const batchSize = 50
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      await supabase.from('ai_agent_chunks').insert(batch)
    }

    // Atualizar integração e fonte
    await supabase
      .from('ai_agent_integrations')
      .update({
        sync_status: 'synced',
        sync_error: null,
        products_synced: products.length,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId)

    await supabase
      .from('ai_agent_sources')
      .update({
        status: 'ready',
        products_count: products.length,
        chunks_count: chunks.length,
        last_product_sync_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      })
      .eq('id', sourceId)

    return NextResponse.json({
      success: true,
      products_synced: products.length,
      chunks_created: chunks.length,
    })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/integrations/[integrationId]/sync:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// BUSCAR PRODUTOS DA INTEGRAÇÃO
// =====================================================

async function fetchProducts(
  supabase: any,
  organizationId: string,
  integration: any
): Promise<any[]> {
  // Buscar produtos da tabela de produtos sincronizados
  const { data: products, error } = await supabase
    .from('shopify_products')
    .select('*')
    .eq('organization_id', organizationId)
    .limit(1000)

  if (error) {
    console.error('Error fetching products:', error)
    // Retornar array vazio se tabela não existir
    return []
  }

  return products || []
}

// =====================================================
// FORMATAR PRODUTO PARA EMBEDDING
// =====================================================

function formatProductForEmbedding(product: any, integration: any): string {
  const parts: string[] = []

  // Nome do produto
  const name = product.title || product.name
  if (name) {
    parts.push(`Produto: ${name}`)
  }

  // Descrição
  const description = product.description || product.body_html
  if (description) {
    // Remover HTML tags
    const cleanDesc = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (cleanDesc) {
      parts.push(`Descrição: ${cleanDesc}`)
    }
  }

  // Preço (se permitido)
  if (integration.allow_price_info) {
    const price = product.price || product.variants?.[0]?.price
    if (price) {
      parts.push(`Preço: R$ ${parseFloat(price).toFixed(2)}`)
    }
    
    // Preço comparativo (desconto)
    const comparePrice = product.compare_at_price || product.variants?.[0]?.compare_at_price
    if (comparePrice && parseFloat(comparePrice) > parseFloat(price || 0)) {
      parts.push(`Preço original: R$ ${parseFloat(comparePrice).toFixed(2)}`)
    }
  }

  // Estoque (se permitido)
  if (integration.allow_stock_info) {
    const quantity = product.inventory_quantity || product.variants?.[0]?.inventory_quantity
    if (quantity !== undefined && quantity !== null) {
      if (quantity > 0) {
        parts.push(`Disponibilidade: Em estoque (${quantity} unidades)`)
      } else {
        parts.push(`Disponibilidade: Fora de estoque`)
      }
    }
  }

  // SKU
  const sku = product.sku || product.variants?.[0]?.sku
  if (sku) {
    parts.push(`SKU: ${sku}`)
  }

  // Categoria/Tipo
  const type = product.product_type || product.category
  if (type) {
    parts.push(`Categoria: ${type}`)
  }

  // Tags
  if (product.tags) {
    const tags = typeof product.tags === 'string' ? product.tags : product.tags.join(', ')
    if (tags) {
      parts.push(`Tags: ${tags}`)
    }
  }

  // Variantes
  if (product.variants && product.variants.length > 1) {
    const variantInfo = product.variants
      .slice(0, 5)
      .map((v: any) => v.title || v.option1)
      .filter((v: any) => v && v !== 'Default Title')
      .join(', ')
    
    if (variantInfo) {
      parts.push(`Variantes: ${variantInfo}`)
    }
  }

  return parts.join('\n')
}

// Config para timeout maior
export const config = {
  maxDuration: 120, // 2 minutos
}
