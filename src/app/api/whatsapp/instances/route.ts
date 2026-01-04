// =============================================
// API: /api/whatsapp/instances - v8 SEGURO
// Gerenciar conexões QR Code (Evolution API)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';

// GET - Listar instâncias
export async function GET(request: NextRequest) {
  // ✅ SEGURANÇA: Auth obrigatório
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  // ✅ SEGURANÇA: Rejeitar se tentar acessar outra org
  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const instanceId = searchParams.get('id');
    const skipStatusCheck = searchParams.get('skipStatus') === 'true';

    if (instanceId) {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', instanceId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;

      if (data?.api_type === 'EVOLUTION' && !skipStatusCheck) {
        const status = await getEvolutionStatus(data);
        const newStatus = status.connected ? 'connected' : 'disconnected';
        
        if (newStatus !== data.status || status.phoneNumber !== data.phone_number) {
          await supabase
            .from('whatsapp_instances')
            .update({
              status: newStatus,
              online_status: status.connected ? 'available' : 'unavailable',
              phone_number: status.phoneNumber || data.phone_number,
              updated_at: new Date().toISOString()
            })
            .eq('id', instanceId);
        }
        
        return NextResponse.json({ 
          instance: { 
            ...data, 
            status: newStatus,
            online_status: status.connected ? 'available' : 'unavailable',
            phone_number: status.phoneNumber || data.phone_number 
          } 
        });
      }

      return NextResponse.json({ instance: data });
    }

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (skipStatusCheck || !data || data.length === 0) {
      return NextResponse.json({ instances: data || [] });
    }

    const instancesWithStatus = await Promise.all(
      data.map(async (instance) => {
        if (instance.api_type === 'EVOLUTION') {
          try {
            const status = await getEvolutionStatus(instance);
            const newStatus = status.connected ? 'connected' : 'disconnected';
            
            if (instance.status !== newStatus) {
              await supabase
                .from('whatsapp_instances')
                .update({
                  status: newStatus,
                  online_status: status.connected ? 'available' : 'unavailable',
                  phone_number: status.phoneNumber || instance.phone_number,
                  updated_at: new Date().toISOString()
                })
                .eq('id', instance.id);
            }
            
            return {
              ...instance,
              status: newStatus,
              online_status: status.connected ? 'available' : 'unavailable',
              phone_number: status.phoneNumber || instance.phone_number,
            };
          } catch (err) {
            console.error(`Error checking status for ${instance.id}:`, err);
            return instance;
          }
        }
        return instance;
      })
    );

    return NextResponse.json({ instances: instancesWithStatus });
  } catch (error: any) {
    console.error('Instances GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar instância, gerar QR, etc
export async function POST(request: NextRequest) {
  // ✅ SEGURANÇA: Auth obrigatório
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { action } = body;

    console.log(`📱 Instances POST action: ${action}`);

    switch (action) {
      case 'create':
        return handleCreate(organizationId, body);
      case 'qr':
        return handleGenerateQR(organizationId, body);
      case 'connect':
        return handleConnect(organizationId, body);
      case 'disconnect':
        return handleDisconnect(organizationId, body);
      case 'status':
        return handleStatus(organizationId, body);
      case 'configure_webhook':
        return handleConfigureWebhook(body);
      case 'check_webhook':
        return handleCheckWebhook(body);
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
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
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
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (instance?.api_type === 'EVOLUTION' && instance?.unique_id) {
      await disconnectEvolution(instance);
      await deleteEvolutionInstance(instance);
    }

    const { error } = await supabase
      .from('whatsapp_instances')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Instances DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// HANDLERS
async function handleCreate(organizationId: string, body: any) {
  const { title } = body;
  const api_url = body.api_url || EVOLUTION_API_URL;
  const api_key = body.api_key || EVOLUTION_API_KEY;

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const instanceName = `worder_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const result = await createEvolutionInstance({ apiUrl: api_url, apiKey: api_key, instanceName });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/evolution/webhook`;
  await configureEvolutionWebhook({ apiUrl: api_url, apiKey: api_key, instanceName, webhookUrl });

  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert({
      organization_id: organizationId,
      title,
      unique_id: instanceName,
      api_type: 'EVOLUTION',
      api_url,
      api_key,
      status: 'pending',
      webhook_url: webhookUrl,
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json({ instance: data, evolution: result.data }, { status: 201 });
}

async function handleGenerateQR(organizationId: string, body: any) {
  const { instanceId } = body;

  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const qrResult = await getEvolutionQR(instance);
  return NextResponse.json(qrResult);
}

async function handleConnect(organizationId: string, body: any) {
  const { instanceId } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('organization_id', organizationId)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const result = await connectEvolution(instance);
  return NextResponse.json(result);
}

async function handleDisconnect(organizationId: string, body: any) {
  const { instanceId } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('organization_id', organizationId)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const result = await disconnectEvolution(instance);

  await supabase
    .from('whatsapp_instances')
    .update({ status: 'disconnected', online_status: 'unavailable', updated_at: new Date().toISOString() })
    .eq('id', instanceId);

  return NextResponse.json(result);
}

async function handleStatus(organizationId: string, body: any) {
  const { instanceId } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('organization_id', organizationId)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const status = await getEvolutionStatus(instance);
  return NextResponse.json(status);
}

async function handleConfigureWebhook(body: any) {
  const { instanceId, webhookUrl } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const apiUrl = instance.api_url || EVOLUTION_API_URL;
  const apiKey = instance.api_key || EVOLUTION_API_KEY;
  const url = webhookUrl || `${WEBHOOK_BASE_URL}/api/whatsapp/evolution/webhook`;

  const result = await configureEvolutionWebhook({ apiUrl, apiKey, instanceName: instance.unique_id, webhookUrl: url });

  if (result.success) {
    await supabase
      .from('whatsapp_instances')
      .update({ webhook_url: url, updated_at: new Date().toISOString() })
      .eq('id', instanceId);
  }

  return NextResponse.json(result);
}

async function handleCheckWebhook(body: any) {
  const { instanceId } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const apiUrl = instance.api_url || EVOLUTION_API_URL;
  const apiKey = instance.api_key || EVOLUTION_API_KEY;

  const result = await checkEvolutionWebhook({ apiUrl, apiKey, instanceName: instance.unique_id });
  return NextResponse.json(result);
}

// EVOLUTION API HELPERS
async function createEvolutionInstance(params: { apiUrl: string; apiKey: string; instanceName: string }) {
  try {
    const response = await fetch(`${params.apiUrl}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': params.apiKey },
      body: JSON.stringify({ instanceName: params.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.message || 'Failed to create instance' };
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function configureEvolutionWebhook(params: { apiUrl: string; apiKey: string; instanceName: string; webhookUrl: string }) {
  try {
    const response = await fetch(`${params.apiUrl}/webhook/set/${params.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': params.apiKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: params.webhookUrl,
          webhookByEvents: true,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'SEND_MESSAGE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'CALL'],
        },
      }),
    });
    const data = await response.json();
    return { success: response.ok, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function checkEvolutionWebhook(params: { apiUrl: string; apiKey: string; instanceName: string }) {
  try {
    const response = await fetch(`${params.apiUrl}/webhook/find/${params.instanceName}`, {
      method: 'GET',
      headers: { 'apikey': params.apiKey },
    });
    const data = await response.json();
    return { configured: !!data?.webhook?.enabled, url: data?.webhook?.url, events: data?.webhook?.events, raw: data };
  } catch (error: any) {
    return { configured: false, error: error.message };
  }
}

async function getEvolutionQR(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const response = await fetch(`${apiUrl}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: { 'apikey': apiKey },
    });
    const data = await response.json();

    if (data.instance?.state === 'open') {
      return { connected: true, phoneNumber: data.instance?.owner?.split('@')?.[0] };
    }
    if (data.base64) return { qrcode: data.base64 };
    if (data.code) return { qrcode: data.code, needsConversion: true };
    if (data.pairingCode) return { qrcode: data.pairingCode, needsConversion: true };
    return { error: 'No QR code available', raw: data };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function getEvolutionStatus(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const stateResponse = await fetch(`${apiUrl}/instance/connectionState/${instance.unique_id}`, {
      method: 'GET',
      headers: { 'apikey': apiKey },
    });
    const stateData = await stateResponse.json();
    
    const state = stateData.instance?.state || stateData.state;
    const isConnected = state === 'open';
    let phoneNumber = stateData.instance?.phoneNumber || stateData.phoneNumber || null;

    if (isConnected && !phoneNumber) {
      try {
        const infoResponse = await fetch(`${apiUrl}/instance/fetchInstances?instanceName=${instance.unique_id}`, {
          method: 'GET',
          headers: { 'apikey': apiKey },
        });
        const infoData = await infoResponse.json();
        const instanceInfo = Array.isArray(infoData) ? infoData[0] : infoData;
        phoneNumber = instanceInfo?.owner?.split('@')?.[0] || instanceInfo?.phone || null;
      } catch (e) {}
    }

    return { connected: isConnected, state, phoneNumber };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}

async function connectEvolution(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    const response = await fetch(`${apiUrl}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: { 'apikey': apiKey },
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
      headers: { 'apikey': apiKey },
    });
    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

async function deleteEvolutionInstance(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    const response = await fetch(`${apiUrl}/instance/delete/${instance.unique_id}`, {
      method: 'DELETE',
      headers: { 'apikey': apiKey },
    });
    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}
