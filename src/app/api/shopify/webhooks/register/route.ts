// =============================================
// API: Register/Fix Shopify Webhooks
// src/app/api/shopify/webhooks/register/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

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
  // Registrar webhooks usa o access_token da loja. A rota aceitava
  // `storeId` solto, sem sessão: um id alheio registrava webhooks na
  // Shopify de outra empresa. A organização passa a vir do token e a
  // loja tem de ser dela.
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const organizationId = auth.orgId

  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { storeId } = body

    // Buscar loja, sempre dentro da organização da sessão
    let query = supabase.from('shopify_stores').select('*').eq('organization_id', organizationId)
    if (storeId) {
      query = query.eq('id', storeId)
    } else {
      query = query.eq('is_active', true)
    }

    const { data: store, error: storeError } = await query.maybeSingle()

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    if (!store.access_token) {
      return NextResponse.json({ error: 'Store has no access token' }, { status: 400 })
    }

    const results: any[] = []
    // ?store_id= in the URL — the handler resolves the store from this
    // first, eliminating the multi-domain alias mismatch that silently
    // dropped webhooks for stores with a non-canonical myshopifyDomain.
    const webhookUrl = `${WEBHOOK_URL_BASE}/api/webhooks/shopify?store_id=${store.id}`

    // 1. Listar webhooks existentes
    const listResponse = await fetch(
      `https://${store.shop_domain}/admin/api/2026-04/webhooks.json`,
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

    // 2. Deletar webhooks NOSSOS (path = /api/webhooks/shopify) que
    //    apontam pra URL diferente da atual — host antigo (ngrok morto,
    //    preview promovido), OU sem ?store_id= (registro pré-fix).
    //    Webhooks de OUTROS apps não são tocados.
    for (const webhook of existingWebhooks || []) {
      const isOurs = typeof webhook.address === 'string' && webhook.address.includes('/api/webhooks/shopify')
      const isCurrent = webhook.address === webhookUrl
      if (isOurs && !isCurrent) {
        try {
          await fetch(
            `https://${store.shop_domain}/admin/api/2026-04/webhooks/${webhook.id}.json`,
            {
              method: 'DELETE',
              headers: { 'X-Shopify-Access-Token': store.access_token },
            }
          )
          results.push({ action: 'deleted', topic: webhook.topic, oldUrl: webhook.address })
        } catch (e: any) {
          results.push({ action: 'delete_failed', topic: webhook.topic, error: e.message })
        }
      }
    }

    // 3. Registrar webhooks necessários — exigir EXATA URL atual
    for (const topic of REQUIRED_WEBHOOKS) {
      const existingCorrect = existingWebhooks?.find(
        (w: any) => w.topic === topic && w.address === webhookUrl
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
          `https://${store.shop_domain}/admin/api/2026-04/webhooks.json`,
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

    // Resumo
    const created = results.filter(r => r.action === 'created').length
    const deleted = results.filter(r => r.action === 'deleted').length
    const existing = results.filter(r => r.action === 'already_exists').length
    const failed = results.filter(r => r.action.includes('failed')).length

    // 4. Atualizar status da loja. Only flag the store as
    // webhooks_registered=true when every required topic is in place
    // (either freshly created or already present and pointed at our
    // current URL). The dashboard uses this flag to render a "reconnect
    // your store" prompt when sync goes silent.
    const fullyRegistered = (created + existing) >= REQUIRED_WEBHOOKS.length
    const statusUpdate: Record<string, any> = {
      webhooks_registered: fullyRegistered,
      webhooks_registered_at: fullyRegistered ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    // connection_status='active' só para loja que JÁ está conectada:
    // registrar webhooks é manutenção, não reconexão. Sem esta guarda,
    // um install-extras disparado em background ressuscitava a loja que
    // o usuário tinha acabado de desconectar.
    if (store.is_active !== false) {
      statusUpdate.connection_status = 'active'
    }
    await supabase
      .from('shopify_stores')
      .update(statusUpdate)
      .eq('id', store.id)

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
  // Mesma história do POST: a organização vinha na URL, sem sessão.
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const organizationId = auth.orgId

  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
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
      `https://${store.shop_domain}/admin/api/2026-04/webhooks.json`,
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
