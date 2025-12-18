import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Buscar status da conexão WhatsApp
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    // Buscar configuração existente
    const { data: config, error } = await supabase
      .from('whatsapp_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    // Se tem config, verificar se token ainda é válido
    if (config) {
      const isValid = await validateAccessToken(config.access_token, config.phone_number_id)
      
      return NextResponse.json({
        connected: isValid,
        config: {
          id: config.id,
          phone_number_id: config.phone_number_id,
          waba_id: config.waba_id,
          business_name: config.business_name,
          phone_number: config.phone_number,
          is_active: config.is_active,
          webhook_verified: config.webhook_verified,
          created_at: config.created_at
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
    const body = await request.json()
    const {
      organizationId,
      phoneNumberId,
      wabaId,
      accessToken,
      webhookVerifyToken
    } = body

    // Validações
    if (!organizationId || !phoneNumberId || !accessToken) {
      return NextResponse.json({
        error: 'Campos obrigatórios: organizationId, phoneNumberId, accessToken'
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

    // 3. Salvar configuração
    const { data: existingConfig } = await supabase
      .from('whatsapp_configs')
      .select('id')
      .eq('organization_id', organizationId)
      .single()

    let config
    if (existingConfig) {
      // Atualizar existente
      const { data, error } = await supabase
        .from('whatsapp_configs')
        .update({
          phone_number_id: phoneNumberId,
          waba_id: wabaId || null,
          access_token: accessToken,
          business_name: validation.businessName,
          phone_number: validation.phoneNumber,
          webhook_verify_token: verifyToken,
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConfig.id)
        .select()
        .single()

      if (error) throw error
      config = data
    } else {
      // Criar novo
      const { data, error } = await supabase
        .from('whatsapp_configs')
        .insert({
          organization_id: organizationId,
          phone_number_id: phoneNumberId,
          waba_id: wabaId || null,
          access_token: accessToken,
          business_name: validation.businessName,
          phone_number: validation.phoneNumber,
          webhook_verify_token: verifyToken,
          is_active: true
        })
        .select()
        .single()

      if (error) throw error
      config = data
    }

    // 4. Também criar/atualizar na tabela whatsapp_instances para compatibilidade
    await syncToInstances(organizationId, config, accessToken)

    console.log('✅ WhatsApp conectado:', validation.phoneNumber)

    return NextResponse.json({
      success: true,
      message: 'WhatsApp Business conectado com sucesso!',
      config: {
        id: config.id,
        phone_number_id: config.phone_number_id,
        waba_id: config.waba_id,
        business_name: config.business_name,
        phone_number: config.phone_number,
        webhook_verify_token: verifyToken,
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://seu-dominio.com'}/api/whatsapp/webhook`
      }
    })
  } catch (error: any) {
    console.error('Error connecting WhatsApp:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Desconectar WhatsApp
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    // Desativar config
    await supabase
      .from('whatsapp_configs')
      .update({ is_active: false })
      .eq('organization_id', organizationId)

    // Desativar instance
    await supabase
      .from('whatsapp_instances')
      .update({ status: 'disconnected' })
      .eq('organization_id', organizationId)

    return NextResponse.json({ success: true, message: 'WhatsApp desconectado' })
  } catch (error: any) {
    console.error('Error disconnecting WhatsApp:', error)
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
}> {
  try {
    // Buscar informações do número
    const phoneResponse = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier`,
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

    // Verificar WABA se fornecido
    if (wabaId) {
      const wabaResponse = await fetch(
        `https://graph.facebook.com/v18.0/${wabaId}?fields=name,currency,timezone_id`,
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
      phoneNumber: phoneData.display_phone_number || phoneNumberId
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
      `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=id`,
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

async function syncToInstances(organizationId: string, config: any, accessToken: string) {
  // Verificar se já existe uma instance
  const { data: existing } = await supabase
    .from('whatsapp_instances')
    .select('id')
    .eq('organization_id', organizationId)
    .single()

  const instanceData = {
    organization_id: organizationId,
    title: config.business_name || 'WhatsApp Business',
    phone_number: config.phone_number,
    phone_number_id: config.phone_number_id,
    access_token: accessToken,
    status: 'connected',
    online_status: 'available',
    api_type: 'META_CLOUD',
    unique_id: `meta_${config.phone_number_id}`,
    updated_at: new Date().toISOString()
  }

  if (existing) {
    await supabase
      .from('whatsapp_instances')
      .update(instanceData)
      .eq('id', existing.id)
  } else {
    await supabase
      .from('whatsapp_instances')
      .insert(instanceData)
  }
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
