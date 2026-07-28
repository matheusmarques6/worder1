import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  subscribeAppToWABA,
  registerPhoneNumber,
  META_BASE_URL,
} from '@/lib/whatsapp/cloud-api';
import { encryptToken } from '@/lib/whatsapp/token-encryption';
import { validateBusinessToken } from '@/lib/whatsapp/token-validation';
import { getAccessToken } from '@/lib/whatsapp/account-loader';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { wlog } from '@/lib/observability/whatsapp-logger';
export const dynamic = 'force-dynamic';

// GET - Buscar status da conexão WhatsApp
export async function GET(request: NextRequest) {
  try {
    // Onda 3.5 P0 — exige Bearer token e escopa para a org do caller.
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    // Se vier organizationId, tem que bater com o orgId do token.
    if (organizationId && organizationId !== orgId) {
      return NextResponse.json(
        { error: 'organizationId does not match authenticated user' },
        { status: 403 },
      )
    }

    // Buscar conta canônica em whatsapp_business_accounts
    const { data: account, error } = await supabase
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    // Se tem conta, verificar se token ainda é válido
    if (account) {
      let token: string | null = null
      try {
        token = getAccessToken(account)
      } catch {
        token = null
      }
      const isValid = token
        ? await validateAccessToken(token, account.phone_number_id)
        : false

      return NextResponse.json({
        connected: isValid,
        config: {
          id: account.id,
          phone_number_id: account.phone_number_id,
          waba_id: account.waba_id,
          business_name: account.verified_name,
          phone_number: account.display_phone_number || account.phone_number,
          is_active: account.status === 'active',
          webhook_verified: !!account.webhook_configured,
          created_at: account.created_at
        }
      })
    }

    return NextResponse.json({ connected: false, config: null })
  } catch (error: any) {
    console.error('Error fetching WhatsApp config:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Conectar WhatsApp Business
export async function POST(request: NextRequest) {
  try {
    // Onda 3.5 P0 — exige Bearer token. O orgId vem do token, não do body.
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const body = await request.json()
    const {
      organizationId,
      storeId,
      phoneNumberId,
      wabaId,
      accessToken,
      webhookVerifyToken,
      twoFactorPin,
    } = body

    // Se o body trouxe organizationId, tem que bater com o do token.
    if (organizationId && organizationId !== orgId) {
      return NextResponse.json(
        { error: 'organizationId does not match authenticated user' },
        { status: 403 },
      )
    }

    // Validações — orgId vem do token (autoritativo).
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({
        error: 'Campos obrigatórios: phoneNumberId, accessToken'
      }, { status: 400 })
    }

    // 1. Validar credenciais com a Meta API
    console.log('🔍 Validando credenciais...')
    const validation = await validateCredentials(accessToken, phoneNumberId, wabaId)

    if (!validation.valid) {
      return NextResponse.json({
        error: validation.error || 'Credenciais inválidas',
        details: validation.details
      }, { status: 400 })
    }

    // 2. Gerar verify token se não fornecido
    const verifyToken = webhookVerifyToken || generateVerifyToken()
    const effectiveWabaId = wabaId || validation.wabaId

    // 2.1. Inscrever o app no WABA. Sem este passo, validar o webhook na Meta
    // apenas comprova que a URL responde — a Meta NAO comeca a enviar eventos
    // ate que o app esteja subscribed_apps do WABA.
    let appSubscribed = false
    let subscriptionError: string | null = null
    if (effectiveWabaId) {
      try {
        await subscribeAppToWABA({ wabaId: effectiveWabaId, accessToken })
        appSubscribed = true
        console.log('✅ App inscrito no WABA:', effectiveWabaId)
      } catch (err: any) {
        subscriptionError = err?.message || 'Falha ao inscrever app no WABA'
        console.warn('⚠️  Subscription falhou:', subscriptionError)
      }
    } else {
      subscriptionError = 'WABA ID nao fornecido nem detectado — informe o WABA ID para receber mensagens.'
      console.warn('⚠️ ', subscriptionError)
    }

    // 2.2. Registrar o phone number na Meta. Sem este passo a Meta retorna
    // erro 132000 ao tentar enviar a primeira mensagem.
    let phoneRegistered = false
    let registerError: string | null = null
    try {
      const pin = (typeof twoFactorPin === 'string' && /^\d{6}$/.test(twoFactorPin))
        ? twoFactorPin
        : Math.floor(100000 + Math.random() * 900000).toString()
      await registerPhoneNumber({ phoneNumberId, accessToken, pin })
      phoneRegistered = true
      console.log('✅ Phone registrado:', phoneNumberId)
    } catch (err: any) {
      const code = err?.code
      if (code === 133006) {
        // Já registrado — tratar como sucesso
        phoneRegistered = true
        console.log('ℹ️ Phone já registrado (133006), seguindo')
      } else if (code === 133005) {
        registerError = 'Conta tem 2FA habilitado. Forneça o PIN de 6 dígitos no campo twoFactorPin.'
      } else {
        registerError = err?.message || 'Falha ao registrar phone number'
      }
      if (registerError) console.warn('⚠️  Register falhou:', registerError)
    }

    // 3. Fail-loud: se qualquer passo crítico falhou, NÃO grava no DB.
    if (!appSubscribed || !phoneRegistered || !effectiveWabaId) {
      const instructions = !effectiveWabaId
        ? 'Seu token precisa da permissão whatsapp_business_management para detectar a WABA. Gere um novo System User Token no Business Manager com as duas permissões: whatsapp_business_messaging E whatsapp_business_management.'
        : !appSubscribed
          ? 'A inscrição do app no WABA falhou. Verifique se o token tem permissão whatsapp_business_management. Detalhe: ' + (subscriptionError || 'erro desconhecido')
          : 'O registro do phone number falhou. ' + (registerError || 'Erro desconhecido. Se a conta tem 2FA habilitado, forneça o PIN.')

      return NextResponse.json({
        success: false,
        error: 'Conexão incompleta',
        details: {
          validated: true,
          subscribed: appSubscribed,
          subscription_error: subscriptionError,
          registered: phoneRegistered,
          register_error: registerError,
          waba_id_detected: !!effectiveWabaId,
        },
        instructions,
      }, { status: 400 })
    }

    // 4. Salvar em whatsapp_business_accounts (tabela canônica Cloud).
    //    organizationId vem do token (autoritativo), não do body.
    const account = await upsertBusinessAccount({
      organizationId: orgId,
      storeId: storeId || null,
      phoneNumberId,
      wabaId: effectiveWabaId,
      accessToken,
      verifyToken,
      businessName: validation.businessName,
      phoneNumber: validation.phoneNumber,
    })

    console.log('✅ WhatsApp conectado:', validation.phoneNumber)
    wlog.info('whatsapp.connect.success', {
      organization_id: orgId,
      phone_number_id: phoneNumberId,
      waba_id: effectiveWabaId,
    })

    return NextResponse.json({
      success: true,
      message: 'WhatsApp Business conectado com sucesso!',
      app_subscribed: appSubscribed,
      phone_registered: phoneRegistered,
      subscription_error: subscriptionError,
      config: {
        id: account.id,
        phone_number_id: account.phone_number_id,
        waba_id: account.waba_id,
        business_name: account.verified_name,
        phone_number: account.display_phone_number || account.phone_number,
        webhook_verify_token: verifyToken,
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br'}/api/whatsapp/cloud/webhook`
      }
    })
  } catch (error: any) {
    console.error('Error connecting WhatsApp:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Desconectar WhatsApp
//
// C1: o DELETE original desativava TODAS as contas ativas da org. Em org
// single-account era OK; com 2+ contas era um foot-gun catastrofico. Agora:
//   - se a request traz accountId, desativa apenas essa (orgId valida posse)
//   - se nao traz e a org tem 1 conta ativa, desativa ela (compat com
//     o card antigo /crm/integrations que nao envia accountId)
//   - se nao traz e a org tem 2+, exige accountId (400)
//   - se nao traz e a org nao tem nenhuma ativa, 404
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    let accountId = searchParams.get('accountId')

    if (organizationId && organizationId !== orgId) {
      return NextResponse.json(
        { error: 'organizationId does not match authenticated user' },
        { status: 403 },
      )
    }

    // Body opcional pode trazer accountId (compat com clientes existentes).
    if (!accountId) {
      try {
        const body = await request.json()
        if (body?.accountId && typeof body.accountId === 'string') {
          accountId = body.accountId
        }
      } catch {
        // sem body — segue
      }
    }

    if (!accountId) {
      const { data: activeAccounts } = await supabase
        .from('whatsapp_business_accounts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'active')

      const count = activeAccounts?.length ?? 0
      if (count === 0) {
        return NextResponse.json(
          { error: 'Nenhuma conta WhatsApp ativa pra desconectar' },
          { status: 404 },
        )
      }
      if (count > 1) {
        return NextResponse.json(
          {
            error: 'accountId obrigatorio quando ha multiplas contas ativas',
            code: 'ACCOUNT_ID_REQUIRED',
            active_accounts: activeAccounts!.map((a) => a.id),
          },
          { status: 400 },
        )
      }
      accountId = activeAccounts![0].id
    }

    const { data: updated, error: updateErr } = await supabase
      .from('whatsapp_business_accounts')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .select('id')

    if (updateErr) throw updateErr

    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'Conta nao encontrada nesta organizacao' },
        { status: 404 },
      )
    }

    wlog.info('whatsapp.connect.disconnect', {
      organization_id: orgId,
      account_id: accountId,
    })

    return NextResponse.json({ success: true, message: 'WhatsApp desconectado' })
  } catch (error: any) {
    wlog.error('whatsapp.connect.disconnect_error', { error: error?.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// FUNÇÕES AUXILIARES
// =============================================

async function validateCredentials(
  accessToken: string,
  phoneNumberId: string,
  wabaId?: string
): Promise<{
  valid: boolean
  error?: string
  details?: any
  businessName?: string
  phoneNumber?: string
  wabaId?: string
}> {
  try {
    // Buscar info do numero — campos que so exigem whatsapp_business_messaging.
    // NAO incluir whatsapp_business_account aqui, esse campo precisa de
    // whatsapp_business_management e quebra com code 100 se o token nao tiver.
    const phoneResponse = await fetch(
      `${META_BASE_URL}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    const phoneData = await phoneResponse.json()

    if (phoneData.error) {
      return {
        valid: false,
        error: translateMetaError(phoneData.error),
        details: phoneData.error
      }
    }

    // B.5 — Token quality check via debug_token (helper compartilhado com o
    // Embedded Signup). Só roda se o app tem credenciais.
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (appId && appSecret) {
      const tokenCheck = await validateBusinessToken({ accessToken, appId, appSecret })
      if (!tokenCheck.valid) {
        return { valid: false, error: tokenCheck.error }
      }
    }

    // Tentativa best-effort de detectar o WABA — falha silenciosa se o token
    // nao tiver whatsapp_business_management.
    let detectedWabaId: string | undefined
    try {
      const wabaDiscovery = await fetch(
        `${META_BASE_URL}/${phoneNumberId}?fields=whatsapp_business_account`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const wabaDiscoveryData = await wabaDiscovery.json()
      if (!wabaDiscoveryData.error) {
        detectedWabaId = wabaDiscoveryData.whatsapp_business_account?.id
      }
    } catch {
      // ignora — usuario pode passar wabaId manualmente
    }

    // Se o usuario passou um wabaId, valida que confere com o detectado
    if (wabaId) {
      const wabaResponse = await fetch(
        `${META_BASE_URL}/${wabaId}?fields=name,currency,timezone_id`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )

      const wabaData = await wabaResponse.json()

      if (wabaData.error) {
        return {
          valid: false,
          error: 'WABA ID inválido ou sem permissão',
          details: wabaData.error
        }
      }
    }

    return {
      valid: true,
      businessName: phoneData.verified_name || 'WhatsApp Business',
      phoneNumber: phoneData.display_phone_number || phoneNumberId,
      wabaId: wabaId || detectedWabaId,
    }
  } catch (error: any) {
    return {
      valid: false,
      error: 'Erro ao validar credenciais. Verifique sua conexão.',
      details: error.message
    }
  }
}

async function validateAccessToken(accessToken: string, phoneNumberId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${META_BASE_URL}/${phoneNumberId}?fields=id`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    const data = await response.json()
    return !data.error
  } catch {
    return false
  }
}

async function upsertBusinessAccount(params: {
  organizationId: string
  storeId: string | null
  phoneNumberId: string
  wabaId: string
  accessToken: string
  verifyToken: string
  businessName?: string
  phoneNumber?: string
}) {
  const {
    organizationId,
    storeId,
    phoneNumberId,
    wabaId,
    accessToken,
    verifyToken,
    businessName,
    phoneNumber,
  } = params

  const row = {
    organization_id: organizationId,
    store_id: storeId,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    phone_number: phoneNumber || null,
    display_phone_number: phoneNumber || null,
    verified_name: businessName || 'WhatsApp Business',
    access_token_encrypted: encryptToken(accessToken),
    webhook_verify_token: verifyToken,
    webhook_configured: true,
    status: 'active',
    connection_method: 'manual',
    updated_at: new Date().toISOString(),
  }

  // Onda 11 / B4+N5: UNIQUE agora e (organization_id, phone_number_id).
  // Mesmo phone_number_id pode existir em outra org no futuro multi-tenant.
  const { data, error } = await supabase
    .from('whatsapp_business_accounts')
    .upsert(row, { onConflict: 'organization_id,phone_number_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

function generateVerifyToken(): string {
  return 'worder_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

function translateMetaError(error: any): string {
  const code = error.code
  const message = error.message || ''

  if (code === 190 || message.includes('access token')) {
    return 'Access Token inválido ou expirado. Gere um novo token permanente.'
  }
  if (code === 100) {
    return 'Phone Number ID inválido. Verifique o ID no Meta Business Suite.'
  }
  if (code === 10 || message.includes('permission')) {
    return 'Permissões insuficientes. O token precisa ter whatsapp_business_messaging e whatsapp_business_management.'
  }
  if (code === 4) {
    return 'Limite de requisições atingido. Aguarde alguns minutos.'
  }

  return error.message || 'Erro desconhecido ao validar credenciais'
}
