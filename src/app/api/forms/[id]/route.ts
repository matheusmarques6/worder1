// =============================================
// CRM FORMS API - Single Form CRUD
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isVisualPopupForm } from '@/lib/forms/submit-utils'

export const dynamic = 'force-dynamic'
// Publicar cria os primeiros códigos únicos na Shopify (até 10, ~8 s).
export const maxDuration = 30

// GET - Obter formulário com campos e eventos
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { user } = auth
    const formId = params.id

    // Use the admin client (the list endpoint also does this) so RLS on
    // crm_forms can't silently strip fields like design_json on read.
    // Isolation enforced by the explicit organization_id filter below.
    const admin = getSupabaseAdmin()
    const { data: form, error } = await admin
      .from('crm_forms')
      .select(`
        *,
        fields:crm_form_fields(
          id, field_type, label, placeholder, description,
          required, position, options, validation,
          map_to_contact_field, conditional, created_at
        ),
        events:crm_form_events(
          id, name, event_name, trigger_type,
          send_to_facebook, send_to_google,
          event_value, event_currency,
          conditions, target_stage_id,
          is_active, position, created_at
        )
      `)
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .single()

    if (error) {
      console.error('[Forms] Error fetching form:', error)
      return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    }

    // Sort fields and events by position
    if (form.fields) {
      form.fields.sort((a: any, b: any) => a.position - b.position)
    }
    if (form.events) {
      form.events.sort((a: any, b: any) => a.position - b.position)
    }
    if (form.pipeline?.stages) {
      form.pipeline.stages.sort((a: any, b: any) => a.position - b.position)
    }

    return NextResponse.json({ form })
  } catch (error: any) {
    console.error('[Forms] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Atualizar formulário
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { user } = auth
    const formId = params.id
    const body = await request.json()

    const {
      name, description, status, pipeline_id, stage_id,
      theme, logo_url, success_message, redirect_url,
      facebook_pixel_id, google_ads_id, google_analytics_id,
      design_json, form_type, behavior, audience, tags, list_id, store_id,
    } = body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (status !== undefined) updates.status = status
    if (pipeline_id !== undefined) updates.pipeline_id = pipeline_id
    if (stage_id !== undefined) updates.stage_id = stage_id
    if (theme !== undefined) updates.theme = theme
    if (logo_url !== undefined) updates.logo_url = logo_url
    if (success_message !== undefined) updates.success_message = success_message
    if (redirect_url !== undefined) updates.redirect_url = redirect_url
    if (facebook_pixel_id !== undefined) updates.facebook_pixel_id = facebook_pixel_id
    if (google_ads_id !== undefined) updates.google_ads_id = google_ads_id
    if (google_analytics_id !== undefined) updates.google_analytics_id = google_analytics_id
    if (design_json !== undefined) updates.design_json = design_json
    if (form_type !== undefined) updates.form_type = form_type
    if (behavior !== undefined) updates.behavior = behavior
    if (audience !== undefined) updates.audience = audience
    if (tags !== undefined) updates.tags = tags
    if (list_id !== undefined) updates.list_id = list_id
    if (store_id !== undefined) updates.store_id = store_id

    // Same admin-client switch as POST/GET. RLS on crm_forms was silently
    // stripping the design_json column on writes; admin bypasses it.
    const admin = getSupabaseAdmin()

    // store_id must belong to the authed org (admin client bypasses RLS,
    // so an arbitrary UUID would bind the popup to another tenant's store).
    if (store_id) {
      const { data: storeRow } = await admin
        .from('shopify_stores')
        .select('id')
        .eq('id', store_id)
        .eq('organization_id', user.organization_id)
        .maybeSingle()
      if (!storeRow) {
        return NextResponse.json(
          { error: 'Loja inválida: selecione uma loja da sua organização.' },
          { status: 400 }
        )
      }
    }

    // Publish gate: a visual popup with store_id NULL renders on EVERY
    // storefront of the org (cross-store fan-out). Multi-store orgs must
    // pick a store before publishing; single-store orgs get it
    // auto-filled with their only active store.
    const { data: current } = await admin
      .from('crm_forms')
      .select('store_id, form_type, design_json, status, ab_parent_id')
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .maybeSingle()
    if (!current) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
    // Variante de experimento não é publicada: entra na loja pelo popup
    // principal, na fatia que o experimento dá a ela.
    if (status === 'published' && current.ab_parent_id) {
      return NextResponse.json({ error: 'Esta é uma variante de experimento. Ative o experimento no popup principal.' }, { status: 400 })
    }
    // A regra de "escolha a loja" vale para o estado RESULTANTE: tirar a
    // loja de um popup já publicado também passa por aqui.
    const effectiveStatus = status !== undefined ? status : current.status
    if (effectiveStatus === 'published' && (status === 'published' || store_id !== undefined)) {

      const effectiveStoreId = store_id !== undefined ? store_id : current?.store_id
      const effectiveFormType = form_type !== undefined ? form_type : current?.form_type
      const effectiveDesign = design_json !== undefined ? design_json : current?.design_json

      if (!effectiveStoreId && isVisualPopupForm(effectiveFormType, effectiveDesign)) {
        const { data: activeStores } = await admin
          .from('shopify_stores')
          .select('id')
          .eq('organization_id', user.organization_id)
          .eq('is_active', true)

        if ((activeStores?.length || 0) > 1) {
          return NextResponse.json(
            { error: 'Selecione a loja do popup antes de publicar.' },
            { status: 400 }
          )
        }
        if (activeStores?.length === 1) {
          updates.store_id = activeStores[0].id
        }
        // 0 lojas ativas: publica sem loja (nada onde renderizar ainda).
      }
    }

    // Editou uma variante: o bundle da loja tem ETag pelo pai — encosta
    // nele para o design novo entrar no ar.
    if (current.ab_parent_id && design_json !== undefined) {
      await admin.from('crm_forms').update({ updated_at: new Date().toISOString() }).eq('id', current.ab_parent_id).eq('organization_id', user.organization_id)
    }
    const { data: form, error } = await admin
      .from('crm_forms')
      .update(updates)
      .eq('id', formId)
      .eq('organization_id', user.organization_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // When a popup flips to published, make sure the storefront loader
    // is actually live on the bound store. The loader is what fetches
    // and renders this popup on the merchant's site — without it the
    // popup is "published" in our DB but invisible in the storefront.
    // install-extras is idempotent so re-running on every publish is
    // safe (existing script tags / pixel / webhooks are detected and
    // reused). Fire-and-forget so the toggle stays snappy.
    if (status === 'published' && form?.store_id) {
      fireInstallExtrasForPublishedForm(form.store_id)
    }

    // O pool de cupons acompanha o bloco de cupom. Ao publicar, um lote
    // pequeno é criado agora para o primeiro inscrito não cair no código
    // estático; o cron repõe o resto. Falha aqui não derruba o save — o
    // estado vai na resposta para a tela avisar.
    let couponPool: any = null
    if (form && (design_json !== undefined || status !== undefined || store_id !== undefined)) {
      try {
        const { syncPoolFromForm, replenishPool, listPoolStatuses } = await import('@/lib/coupons/pool-service')
        const synced = await syncPoolFromForm(form)
        if (synced.pools.length && form.status === 'published') {
          // Base e tiers: um lote pequeno em cada, dentro do mesmo orçamento.
          const budget = Math.max(2000, Math.floor(8000 / synced.pools.length))
          for (const p of synced.pools) {
            await replenishPool(p.id, user.organization_id, { maxCreate: 10, timeBudgetMs: budget })
          }
        }
        const statuses = await listPoolStatuses(user.organization_id, form.id)
        const active = statuses.filter((s) => s.pool?.status === 'active')
        couponPool = {
          active: active.length > 0,
          status: active.length ? (active.some((s) => s.pool?.status === 'error') ? 'error' : 'active') : (statuses[0]?.pool?.status || null),
          usable: active.reduce((n, s) => n + s.usable, 0),
          last_error: active.find((s) => s.pool?.last_error)?.pool?.last_error || null,
          reason: synced.reason || null,
          pools: statuses.map((s) => ({ tier_key: s.pool?.tier_key || 'base', status: s.pool?.status, usable: s.usable })),
        }
      } catch (e: any) {
        console.warn('[Forms] coupon pool sync failed (non-blocking):', e?.message)
        couponPool = { active: false, status: 'error', usable: 0, last_error: e?.message || 'erro', reason: null }
      }
    }

    return NextResponse.json({ form, coupon_pool: couponPool })
  } catch (error: any) {
    console.error('[Forms] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function fireInstallExtrasForPublishedForm(storeId: string): void {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const secret = process.env.CRON_SECRET || ''
  if (!baseUrl) return
  fetch(`${baseUrl}/api/shopify/install-extras`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}),
      'X-Internal-Request': 'true',
    },
    body: JSON.stringify({ storeId }),
    keepalive: true,
  }).catch((err) => {
    console.warn('[Forms] install-extras after publish failed (non-blocking):', err?.message)
  })
}

// DELETE - Deletar formulário
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { user } = auth
    const formId = params.id

    const admin = getSupabaseAdmin()
    // Os pools de cupom não têm FK para o popup: sem isto o cron seguiria
    // criando descontos na Shopify para um popup que não existe mais.
    try {
      const { retirePoolsForForm } = await import('@/lib/coupons/pool-service')
      await retirePoolsForForm(user.organization_id, formId)
    } catch (e: any) {
      console.warn('[Forms] retire pools failed (continuing delete):', e?.message)
    }
    const { error } = await admin
      .from('crm_forms')
      .delete()
      .eq('id', formId)
      .eq('organization_id', user.organization_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Forms] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
