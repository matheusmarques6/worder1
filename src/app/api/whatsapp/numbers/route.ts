import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

// ✅ FASE 1: Force dynamic para evitar cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Headers padrão sem cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

// GET - Lista números de WhatsApp
export async function GET(request: NextRequest) {
  // ✅ P1 v2: org do token; organization_id/organizationId da query é IGNORADO
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const { searchParams } = new URL(request.url)

    const storeId = searchParams.get('store_id') || searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json(
        { error: 'store_id is required for multi-store isolation' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Parâmetros opcionais
    const includeStats = searchParams.get('include_stats') === 'true'
    const connectedOnly = searchParams.get('connected_only') === 'true'

    console.log('[Numbers API] Fetching for org:', organizationId, 'store:', storeId)

    // ✅ FASE 1: Query filtrada por organization_id E store_id
    let { data: numbers, error } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    // Se a nova tabela não existe, usa a antiga (whatsapp_instances)
    if (error && error.code === '42P01') {
      console.log('[Numbers API] Fallback to whatsapp_instances')
      
      const result = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })

      if (result.data) {
        // Converter formato antigo para novo
        numbers = result.data.map((instance: any) => ({
          id: instance.id,
          organization_id: instance.organization_id,
          store_id: instance.store_id,
          phone_number: instance.phone_number || instance.instance_name,
          phone_number_id: instance.phone_number_id,
          display_name: instance.display_name || instance.instance_name,
          provider: instance.provider || 'meta_cloud',
          is_connected: instance.status === 'connected' || instance.is_connected,
          is_active: instance.is_active !== false,
          connection_status: instance.status || (instance.is_connected ? 'connected' : 'disconnected'),
          // Credenciais
          access_token: instance.access_token,
          webhook_verify_token: instance.webhook_verify_token,
          instance_name: instance.instance_name,
          api_key: instance.api_key,
          // Meta
          business_account_id: instance.business_account_id,
          created_at: instance.created_at,
          updated_at: instance.updated_at,
        }))
      }
      error = result.error
    }

    if (error) throw error

    let result = numbers || []

    // ✅ FIX Inbox: o fluxo de conexão Cloud (POST /api/whatsapp/connect) grava em
    // whatsapp_business_accounts (tabela canônica), não em whatsapp_numbers.
    // Sem este merge, um número conectado via Meta Cloud nunca aparece no Inbox.
    // Conta sem store_id é org-wide e aparece em todas as lojas da org.
    try {
      const { data: accounts } = await supabase
        .from('whatsapp_business_accounts')
        .select('id, waba_id, phone_number_id, phone_number, display_phone_number, verified_name, status, store_id, webhook_configured, created_at, updated_at')
        .eq('organization_id', organizationId)
        .or(`store_id.eq.${storeId},store_id.is.null`)

      if (accounts && accounts.length > 0) {
        const seen = new Set(
          result.map((n: any) => n.phone_number_id || n.id).filter(Boolean)
        )
        for (const acc of accounts) {
          if (seen.has(acc.phone_number_id) || seen.has(acc.id)) continue
          result.push({
            id: acc.id,
            organization_id: organizationId,
            store_id: acc.store_id ?? storeId,
            phone_number: acc.display_phone_number || acc.phone_number,
            phone_number_id: acc.phone_number_id,
            display_name: acc.verified_name || acc.display_phone_number || acc.phone_number,
            provider: 'meta_cloud',
            is_connected: acc.status === 'active',
            is_active: acc.status === 'active',
            connection_status: acc.status === 'active' ? 'connected' : 'disconnected',
            business_account_id: acc.waba_id,
            source: 'business_account',
            created_at: acc.created_at,
            updated_at: acc.updated_at,
          })
        }
      }
    } catch (accErr: any) {
      // Tabela pode não existir em ambientes antigos — não derruba a listagem
      console.warn('[Numbers API] business_accounts merge skipped:', accErr?.message)
    }

    // ✅ FIX Inbox (legado): números conectados antes da migração vivem só em
    // whatsapp_instances. O fallback 42P01 acima só roda quando whatsapp_numbers
    // NÃO existe; quando existe mas está vazia, o número legado sumia.
    try {
      const { data: legacy } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('store_id', storeId)

      if (legacy && legacy.length > 0) {
        const seen = new Set(
          result.map((n: any) => n.phone_number_id || n.id).filter(Boolean)
        )
        for (const instance of legacy) {
          const metaId = instance.phone_number_id
            || (typeof instance.unique_id === 'string' && instance.unique_id.startsWith('meta_')
              ? instance.unique_id.slice(5)
              : null)
          if (seen.has(instance.id) || (metaId && seen.has(metaId))) continue
          result.push({
            id: instance.id,
            organization_id: instance.organization_id,
            store_id: instance.store_id,
            phone_number: instance.phone_number || instance.instance_name,
            phone_number_id: metaId,
            display_name: instance.display_name || instance.title || instance.phone_number,
            provider: instance.api_type === 'META_CLOUD' ? 'meta_cloud' : (instance.provider || 'evolution'),
            is_connected: instance.status === 'connected' || instance.is_connected === true,
            is_active: instance.is_active !== false,
            connection_status: instance.status || 'disconnected',
            source: 'legacy_instance',
            created_at: instance.created_at,
            updated_at: instance.updated_at,
          })
        }
      }
    } catch (legacyErr: any) {
      console.warn('[Numbers API] legacy instances merge skipped:', legacyErr?.message)
    }

    // Filtrar apenas conectados
    if (connectedOnly) {
      result = result.filter((n: any) => n.is_connected && n.is_active)
    }

    // Incluir estatísticas
    if (includeStats && result.length > 0) {
      for (const number of result) {
        // Contar conversas da mesma loja
        const { count: conversationsCount } = await supabase
          .from('whatsapp_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .or(`whatsapp_number_id.eq.${number.id},instance_id.eq.${number.id}`)

        // Contar mensagens hoje
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const { count: messagesToday } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .or(`whatsapp_number_id.eq.${number.id},instance_id.eq.${number.id}`)
          .gte('created_at', today.toISOString())

        number.stats = {
          total_conversations: conversationsCount || 0,
          messages_today: messagesToday || 0,
        }
      }
    }

    console.log('[Numbers API] Found', result.length, 'numbers for store:', storeId)

    return NextResponse.json(
      { numbers: result },
      { headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// POST - Adicionar número de WhatsApp
export async function POST(request: NextRequest) {
  // ✅ P1 v2: org do token; organization_id do body é IGNORADO
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const body = await request.json()
    const {
      store_id,
      provider = 'meta_cloud',
      phone_number,
      display_name,
      // Meta Cloud
      phone_number_id,
      access_token,
      business_account_id,
      webhook_verify_token,
      // Legado (compat tabela antiga whatsapp_instances)
      instance_name,
      api_key,
    } = body

    if (!store_id) {
      return NextResponse.json(
        { error: 'store_id is required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    if (!phone_number && !instance_name) {
      return NextResponse.json(
        { error: 'phone_number ou instance_name é obrigatório' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Dados do número
    const numberData: any = {
      organization_id: organizationId,
      store_id,
      provider,
      phone_number: phone_number || instance_name,
      display_name: display_name || phone_number || instance_name,
      is_connected: false,
      is_active: true,
      connection_status: 'disconnected',
    }

    // Dados específicos do provider Cloud (Meta)
    if (provider === 'meta_cloud') {
      numberData.phone_number_id = phone_number_id
      numberData.access_token = access_token
      numberData.business_account_id = business_account_id
      numberData.webhook_verify_token = webhook_verify_token || generateToken()
    }

    // Inserir
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .insert(numberData)
      .select()
      .single()

    // Se a tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      const instanceData = {
        organization_id: organizationId,
        store_id,
        instance_name: instance_name || phone_number,
        phone_number,
        display_name: display_name || phone_number,
        provider,
        status: 'disconnected',
        is_active: true,
        phone_number_id,
        access_token,
        business_account_id,
        webhook_verify_token: webhook_verify_token || generateToken(),
        api_key,
      }

      const result = await supabase
        .from('whatsapp_instances')
        .insert(instanceData)
        .select()
        .single()

      if (result.error) throw result.error
      return NextResponse.json(
        { number: result.data },
        { status: 201, headers: NO_CACHE_HEADERS }
      )
    }

    if (error) throw error

    return NextResponse.json(
      { number: data },
      { status: 201, headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] POST Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// PATCH - Atualizar número de WhatsApp
export async function PATCH(request: NextRequest) {
  // ✅ P1 v2: org do token
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const body = await request.json()
    const { id, store_id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    if (!store_id) {
      return NextResponse.json(
        { error: 'store_id is required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Campos permitidos
    const allowed = [
      'display_name',
      'is_active',
      'is_connected',
      'connection_status',
      'access_token',
      'api_key',
    ]
    
    const filtered: any = {}
    allowed.forEach(f => {
      if (f in updateData) filtered[f] = updateData[f]
    })
    filtered.updated_at = new Date().toISOString()

    // ✅ FASE 1: Filtrar por organization_id E store_id
    let { data, error } = await supabase
      .from('whatsapp_numbers')
      .update(filtered)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('store_id', store_id)
      .select()
      .single()

    // Tentar tabela antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_instances')
        .update(filtered)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .eq('store_id', store_id)
        .select()
        .single()

      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json(
      { number: data },
      { headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] PATCH Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// DELETE - Remover número de WhatsApp
export async function DELETE(request: NextRequest) {
  // ✅ P1 v2: org do token
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const storeId = searchParams.get('store_id') || searchParams.get('storeId')

    if (!id) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    if (!storeId) {
      return NextResponse.json(
        { error: 'store_id is required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 1: Filtrar por organization_id E store_id
    let { error } = await supabase
      .from('whatsapp_numbers')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('store_id', storeId)

    // Tentar tabela antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId)
        .eq('store_id', storeId)

      error = result.error
    }

    if (error) throw error

    return NextResponse.json(
      { success: true },
      { headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] DELETE Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// Helper para gerar token de verificação
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
}
