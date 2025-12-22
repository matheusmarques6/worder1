// =============================================
// API: WhatsApp Cloud - Accounts
// src/app/api/whatsapp/cloud/accounts/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';
import { nanoid } from 'nanoid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================
// GET - Listar contas conectadas
// =============================================
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Buscar organização do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Buscar contas WABA
    const { data: accounts, error } = await supabase
      .from('whatsapp_business_accounts')
      .select(`
        id,
        waba_id,
        phone_number_id,
        phone_number,
        display_phone_number,
        verified_name,
        quality_rating,
        status,
        account_mode,
        messaging_limit,
        webhook_configured,
        messages_sent_today,
        messages_received_today,
        last_message_at,
        created_at
      `)
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching accounts:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ accounts: accounts || [] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// POST - Conectar nova conta WABA
// =============================================
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const { 
      wabaId, 
      phoneNumberId, 
      accessToken, 
      businessId,
      appId 
    } = body;

    // Validar campos obrigatórios
    if (!wabaId || !phoneNumberId || !accessToken) {
      return NextResponse.json({ 
        error: 'Missing required fields: wabaId, phoneNumberId, accessToken' 
      }, { status: 400 });
    }

    // Verificar se já existe
    const { data: existing } = await supabase
      .from('whatsapp_business_accounts')
      .select('id')
      .eq('phone_number_id', phoneNumberId)
      .single();

    if (existing) {
      return NextResponse.json({ 
        error: 'Phone number already connected' 
      }, { status: 409 });
    }

    // Validar credenciais com a API
    const client = createWhatsAppCloudClient({
      phoneNumberId,
      accessToken,
      wabaId,
    });

    let phoneInfo;
    try {
      phoneInfo = await client.getPhoneNumber();
    } catch (apiError: any) {
      console.error('API validation error:', apiError);
      return NextResponse.json({ 
        error: 'Invalid credentials: ' + (apiError.message || 'Could not validate with Meta API')
      }, { status: 400 });
    }

    // Gerar webhook verify token
    const webhookVerifyToken = nanoid(32);

    // Salvar conta
    const { data: account, error: insertError } = await supabase
      .from('whatsapp_business_accounts')
      .insert({
        organization_id: profile.organization_id,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        business_id: businessId,
        app_id: appId,
        phone_number: phoneInfo.display_phone_number.replace(/\D/g, ''),
        display_phone_number: phoneInfo.display_phone_number,
        verified_name: phoneInfo.verified_name,
        quality_rating: phoneInfo.quality_rating || 'UNKNOWN',
        access_token: accessToken,
        webhook_verify_token: webhookVerifyToken,
        status: 'active',
        account_mode: 'LIVE',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save account' }, { status: 500 });
    }

    // Retornar com instruções de webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br'}/api/whatsapp/cloud/webhook`;

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        phoneNumber: account.display_phone_number,
        verifiedName: account.verified_name,
        qualityRating: account.quality_rating,
        status: account.status,
      },
      webhook: {
        url: webhookUrl,
        verifyToken: webhookVerifyToken,
        instructions: [
          '1. Acesse o Meta for Developers (developers.facebook.com)',
          '2. Vá para seu App > WhatsApp > Configuration',
          '3. Em Webhook, clique em Edit',
          `4. Callback URL: ${webhookUrl}`,
          `5. Verify Token: ${webhookVerifyToken}`,
          '6. Clique em Verify and Save',
          '7. Inscreva-se nos campos: messages, message_template_status_update',
        ],
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// DELETE - Desconectar conta
// =============================================
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('id');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    // Verificar propriedade
    const { data: account } = await supabase
      .from('whatsapp_business_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Atualizar status para desconectado (não deletar para manter histórico)
    const { error: updateError } = await supabase
      .from('whatsapp_business_accounts')
      .update({
        status: 'disconnected',
        access_token: null,
      })
      .eq('id', accountId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
