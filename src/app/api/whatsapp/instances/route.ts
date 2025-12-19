// =============================================
// API: /api/whatsapp/instances
// Gerenciar conexões QR Code (Evolution API / Baileys)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================
// Evolution API Configuration
// =============================================
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';

// GET - Listar instâncias
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const instanceId = searchParams.get('id');

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 });
    }

    // Buscar instância específica
    if (instanceId) {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', instanceId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;

      // Se Evolution API, buscar status atualizado
      if (data?.api_type === 'EVOLUTION' && data?.api_url) {
        const status = await getEvolutionStatus(data);
        return NextResponse.json({ instance: { ...data, ...status } });
      }

      return NextResponse.json({ instance: data });
    }

    // Listar todas
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ instances: data });
  } catch (error: any) {
    console.error('Instances GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar instância ou gerar QR
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create':
        return handleCreate(body);
      case 'qr':
        return handleGenerateQR(body);
      case 'connect':
        return handleConnect(body);
      case 'disconnect':
        return handleDisconnect(body);
      case 'status':
        return handleStatus(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Instances POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar instância
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ instance: data });
  } catch (error: any) {
    console.error('Instances PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Remover instância
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    // Buscar instância para desconectar
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', id)
      .single();

    // Se Evolution API, desconectar primeiro
    if (instance?.api_type === 'EVOLUTION' && instance?.api_url) {
      await disconnectEvolution(instance);
    }

    const { error } = await supabase
      .from('whatsapp_instances')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Instances DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// HANDLERS
// =============================================

async function handleCreate(body: any) {
  const { organization_id, title, api_type } = body;
  
  // Usar credenciais padrão da Evolution API
  const api_url = body.api_url || EVOLUTION_API_URL;
  const api_key = body.api_key || EVOLUTION_API_KEY;

  if (!organization_id || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const uniqueId = `zapzap_${organization_id.slice(0, 8)}_${Date.now()}`;

  // Criar instância na Evolution API
  const evolutionResult = await createEvolutionInstance({
    apiUrl: api_url,
    apiKey: api_key,
    instanceName: uniqueId,
  });

  if (!evolutionResult.success) {
    return NextResponse.json({ error: evolutionResult.error }, { status: 400 });
  }

  // Configurar Webhook para receber mensagens
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`;
  try {
    await configureEvolutionWebhook({
      apiUrl: api_url,
      apiKey: api_key,
      instanceName: uniqueId,
      webhookUrl,
    });
    console.log('✅ Webhook configurado:', webhookUrl);
  } catch (webhookError) {
    console.warn('⚠️ Erro ao configurar webhook:', webhookError);
  }

  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert({
      organization_id,
      title,
      unique_id: uniqueId,
      api_type: api_type || 'EVOLUTION',
      api_url,
      api_key,
      status: 'GENERATING',
      webhook_url: webhookUrl,
    })
    .select()
    .single();

  if (error) throw error;

  return NextResponse.json({ instance: data });
}

async function handleGenerateQR(body: any) {
  const { id, organization_id } = body;

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  // Buscar instância
  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  // Gerar QR via Evolution API
  if (instance.api_type === 'EVOLUTION' && instance.api_url) {
    const qrResult = await getEvolutionQR(instance);

    if (qrResult.qrcode) {
      // Atualizar QR no banco
      await supabase
        .from('whatsapp_instances')
        .update({ 
          qr_code: qrResult.qrcode,
          status: 'GENERATING',
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      return NextResponse.json({ qr_code: qrResult.qrcode, status: 'GENERATING' });
    }

    // Já conectado
    if (qrResult.connected) {
      await supabase
        .from('whatsapp_instances')
        .update({ 
          status: 'ACTIVE',
          phone_number: qrResult.phoneNumber,
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      return NextResponse.json({ status: 'ACTIVE', phone_number: qrResult.phoneNumber });
    }

    return NextResponse.json({ error: qrResult.error || 'Failed to generate QR' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Instance type not supported' }, { status: 400 });
}

async function handleConnect(body: any) {
  const { id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  if (instance.api_type === 'EVOLUTION') {
    const result = await connectEvolution(instance);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Not implemented' }, { status: 400 });
}

async function handleDisconnect(body: any) {
  const { id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  if (instance.api_type === 'EVOLUTION') {
    await disconnectEvolution(instance);
    
    await supabase
      .from('whatsapp_instances')
      .update({ 
        status: 'INACTIVE',
        online_status: 'unavailable',
        updated_at: new Date().toISOString() 
      })
      .eq('id', id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Not implemented' }, { status: 400 });
}

async function handleStatus(body: any) {
  const { id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  if (instance.api_type === 'EVOLUTION') {
    const status = await getEvolutionStatus(instance);
    
    // Atualizar status no banco
    await supabase
      .from('whatsapp_instances')
      .update({ 
        status: status.connected ? 'ACTIVE' : 'INACTIVE',
        online_status: status.connected ? 'available' : 'unavailable',
        phone_number: status.phoneNumber || instance.phone_number,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id);

    return NextResponse.json(status);
  }

  return NextResponse.json({ error: 'Not implemented' }, { status: 400 });
}

// =============================================
// EVOLUTION API HELPERS
// =============================================

async function createEvolutionInstance(params: { apiUrl: string; apiKey: string; instanceName: string }) {
  try {
    const response = await fetch(`${params.apiUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': params.apiKey,
      },
      body: JSON.stringify({
        instanceName: params.instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to create instance' };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function getEvolutionQR(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const response = await fetch(`${apiUrl}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
      },
    });

    const data = await response.json();
    console.log('📱 QR Response:', data);

    if (data.base64) {
      return { qrcode: data.base64 };
    }
    
    if (data.code) {
      // QR code em formato string (precisa converter para base64 com biblioteca QR)
      return { qrcode: data.code, needsConversion: true };
    }

    if (data.instance?.state === 'open') {
      return { connected: true, phoneNumber: data.instance?.phoneNumber };
    }

    return { error: 'No QR code available' };
  } catch (error: any) {
    console.error('❌ getEvolutionQR error:', error);
    return { error: error.message };
  }
}

async function getEvolutionStatus(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const response = await fetch(`${apiUrl}/instance/connectionState/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
      },
    });

    const data = await response.json();
    console.log('📊 Status Response:', data);

    // Evolution API pode retornar em diferentes formatos
    const state = data.instance?.state || data.state;
    const isConnected = state === 'open';

    return {
      connected: isConnected,
      state: state,
      phoneNumber: data.instance?.phoneNumber || data.phoneNumber,
    };
  } catch (error: any) {
    console.error('❌ getEvolutionStatus error:', error);
    return { connected: false, error: error.message };
  }
}

async function connectEvolution(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const response = await fetch(`${apiUrl}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
      },
    });

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

async function disconnectEvolution(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const response = await fetch(`${apiUrl}/instance/logout/${instance.unique_id}`, {
      method: 'DELETE',
      headers: {
        'apikey': apiKey,
      },
    });

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

async function configureEvolutionWebhook(params: { 
  apiUrl: string; 
  apiKey: string; 
  instanceName: string; 
  webhookUrl: string 
}) {
  try {
    const response = await fetch(`${params.apiUrl}/webhook/set/${params.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': params.apiKey,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: params.webhookUrl,
          webhookByEvents: true,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE', 
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
            'CALL',
          ],
        },
      }),
    });

    const data = await response.json();
    console.log('🔗 Webhook config response:', data);
    return { success: true, data };
  } catch (error: any) {
    console.error('❌ Webhook config error:', error);
    return { success: false, error: error.message };
  }
}

// sendEvolutionMessage foi movido para /lib/whatsapp/evolution-api.ts
