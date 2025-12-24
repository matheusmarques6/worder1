// =============================================
// API: Register/Fix Shopify Webhooks
// src/app/api/shopify/webhooks/register/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

const WEBHOOK_URL_BASE = process.env.NEXT_PUBLIC_APP_URL || ''

// Webhooks que precisamos registrar
const REQUIRED_WEBHOOKS = [
  'customers/create',
  'customers/update',
  'orders/create',
  'orders/paid',
  'orders/fulfilled',
  'orders/cancelled',
  'checkouts/create',
  'checkouts/update',
]

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { storeId, organizationId } = body

    if (!storeId && !organizationId) {
      return NextResponse.json({ error: 'storeId or organizationId required' }, { status: 400 })
    }

    // Buscar loja
    let query = supabase.from('shopify_stores').select('*')
    if (storeId) {
      query = query.eq('id', storeId)
    } else {
      query = query.eq('organization_id', organizationId).eq('is_active', true)
    }

    const { data: store, error: storeError } = await query.maybeSingle()

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    if (!store.access_token) {
      return NextResponse.json({ error: 'Store has no access token' }, { status: 400 })
    }

    const results: any[] = []
    const webhookUrl = `${WEBHOOK_URL_BASE}/api/webhooks/shopify`

    // 1. Listar webhooks existentes
    const listResponse = await fetch(
      `https://${store.shop_domain}/admin/api/2024-01/webhooks.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
        },
      }
    )

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      return NextResponse.json({ 
        error: 'Failed to list webhooks', 
        details: errorText 
      }, { status: 500 })
    }

    const { webhooks: existingWebhooks } = await listResponse.json()
    console.log(`[Shopify] Found ${existingWebhooks?.length || 0} existing webhooks`)

    // 2. Deletar webhooks com URL errada
    for (const webhook of existingWebhooks || []) {
      if (!webhook.address.includes('/api/webhooks/shopify')) {
        console.log(`[Shopify] Deleting webhook with wrong URL: ${webhook.address}`)
        try {
          await fetch(
            `https://${store.shop_domain}/admin/api/2024-01/webhooks/${webhook.id}.json`,
            {
              method: 'DELETE',
              headers: {
                'X-Shopify-Access-Token': store.access_token,
              },
            }
          )
          results.push({
            action: 'deleted',
            topic: webhook.topic,
            oldUrl: webhook.address,
          })
        } catch (e: any) {
          results.push({
            action: 'delete_failed',
            topic: webhook.topic,
            error: e.message,
          })
        }
      }
    }

    // 3. Registrar webhooks necessários
    for (const topic of REQUIRED_WEBHOOKS) {
      // Verificar se já existe com URL correta
      const existingCorrect = existingWebhooks?.find(
        (w: any) => w.topic === topic && w.address.includes('/api/webhooks/shopify')
      )

      if (existingCorrect) {
        results.push({
          action: 'already_exists',
          topic,
          url: existingCorrect.address,
        })
        continue
      }

      // Criar novo webhook
      try {
        const createResponse = await fetch(
          `https://${store.shop_domain}/admin/api/2024-01/webhooks.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': store.access_token,
            },
            body: JSON.stringify({
              webhook: {
                topic,
                address: webhookUrl,
                format: 'json',
              },
            }),
          }
        )

        if (createResponse.ok) {
          const { webhook } = await createResponse.json()
          results.push({
            action: 'created',
            topic,
            url: webhook.address,
            id: webhook.id,
          })
        } else {
          const errorText = await createResponse.text()
          results.push({
            action: 'create_failed',
            topic,
            error: errorText,
          })
        }
      } catch (e: any) {
        results.push({
          action: 'create_failed',
          topic,
          error: e.message,
        })
      }
    }

    // 4. Atualizar status da loja
    await supabase
      .from('shopify_stores')
      .update({
        connection_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id)

    // Resumo
    const created = results.filter(r => r.action === 'created').length
    const deleted = results.filter(r => r.action === 'deleted').length
    const existing = results.filter(r => r.action === 'already_exists').length
    const failed = results.filter(r => r.action.includes('failed')).length

    return NextResponse.json({
      success: true,
      webhookUrl,
      summary: {
        created,
        deleted,
        existing,
        failed,
        total: REQUIRED_WEBHOOKS.length,
      },
      results,
    })
  } catch (error: any) {
    console.error('Error registering webhooks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - Listar webhooks registrados
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
  }

  try {
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle()

    if (!store?.access_token) {
      return NextResponse.json({ error: 'Store not found or no access token' }, { status: 404 })
    }

    const response = await fetch(
      `https://${store.shop_domain}/admin/api/2024-01/webhooks.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 })
    }

    const { webhooks } = await response.json()

    return NextResponse.json({
      webhooks: webhooks?.map((w: any) => ({
        id: w.id,
        topic: w.topic,
        address: w.address,
        created_at: w.created_at,
        isCorrectUrl: w.address.includes('/api/webhooks/shopify'),
      })) || [],
      correctUrl: `${WEBHOOK_URL_BASE}/api/webhooks/shopify`,
      requiredTopics: REQUIRED_WEBHOOKS,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
