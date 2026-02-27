// =============================================
// API: /api/whatsapp/instances - v9
// CORREÇÃO: Filtrar por store_id para isolamento multi-loja
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';

// =============================================
// GET - Listar instâncias
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const storeId = searchParams.get('store_id'); // ✅ NOVO: Filtro por loja
    const instanceId = searchParams.get('id');
    const skipStatusCheck = searchParams.get('skipStatus') === 'true';

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 });
    }

    // Buscar instância específica
    if (instanceId) {
      let query = supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', instanceId)
        .eq('organization_id', organizationId);
      
      // ✅ CRÍTICO: Filtrar por store_id se fornecido
      if (storeId) {
        query = query.eq('store_id', storeId);
      }

      const { data, error } = await query.single();

      if (error) throw error;

      // Se Evolution API, buscar status atualizado
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

    // =============================================
    // ✅ CORREÇÃO CRÍTICA: Listar apenas instâncias da LOJA
    // =============================================
    let query = supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId);
    
    // ✅ CRÍTICO: Filtrar por store_id se fornecido
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    // Se não quiser verificar status, retorna direto
    if (skipStatusCheck || !data || data.length === 0) {
      return NextResponse.json({ instances: data || [] });
    }

    // Verificar status de cada instância Evolution
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
            console.error(`❌ Error checking status for ${instance.id}:`, err);
            return instance;
          }
        }
        return instance;
      })
    );

    return NextResponse.json({ instances: instancesWithStatus });
  } catch (error: any) {
    console.error('❌ Instances GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Criar instância
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    console.log(`📱 Instances POST action: ${action}`);

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
    console.error('❌ Instances POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// HANDLERS
// =============================================

async function handleCreate(body: any) {
  const { organization_id, store_id, title } = body;

  const api_url = body.api_url || EVOLUTION_API_URL;
  const api_key = body.api_key || EVOLUTION_API_KEY;

  if (!organization_id || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // ✅ CRÍTICO: Verificar se store_id foi fornecido
  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  // ✅ CORREÇÃO: Verificar se Evolution API está configurada
  if (!api_key) {
    return NextResponse.json({
      error: 'Evolution API não configurada. Configure EVOLUTION_API_KEY nas variáveis de ambiente ou use a API Oficial do WhatsApp.',
      code: 'EVOLUTION_NOT_CONFIGURED'
    }, { status: 400 });
  }

  const uniqueId = `zapzap_${organization_id.slice(0, 8)}_${Date.now()}`;
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`;

  console.log(`🚀 Creating instance: ${uniqueId} for store: ${store_id}`);

  // Criar instância na Evolution API
  const evolutionResult = await createEvolutionInstance({
    apiUrl: api_url,
    apiKey: api_key,
    instanceName: uniqueId,
  });

  if (!evolutionResult.success) {
    return NextResponse.json({ error: evolutionResult.error }, { status: 500 });
  }

  // Configurar webhook
  await configureEvolutionWebhook({
    apiUrl: api_url,
    apiKey: api_key,
    instanceName: uniqueId,
    webhookUrl: webhookUrl,
  });

  // ✅ CRÍTICO: Salvar com store_id
  const { data: instance, error: dbError } = await supabase
    .from('whatsapp_instances')
    .insert({
      organization_id,
      store_id, // ✅ NOVO: Associar à loja
      title,
      unique_id: uniqueId,
      instance_name: uniqueId,
      api_type: 'EVOLUTION',
      server_url: api_url,
      api_key: api_key,
      status: 'disconnected',
      webhook_url: webhookUrl,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (dbError) {
    console.error('❌ DB Error:', dbError);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ instance });
}

async function handleGenerateQR(body: any) {
  const { instance_id } = body;

  if (!instance_id) {
    return NextResponse.json({ error: 'instance_id required' }, { status: 400 });
  }

  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instance_id)
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const qrResult = await getEvolutionQR(instance);

  if (qrResult.connected) {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'connected',
        phone_number: qrResult.phoneNumber,
        qr_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance_id);

    return NextResponse.json({ connected: true, phoneNumber: qrResult.phoneNumber });
  }

  if (qrResult.qrcode) {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'qr_pending',
        qr_code: qrResult.qrcode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance_id);

    return NextResponse.json({ qrcode: qrResult.qrcode });
  }

  return NextResponse.json({ error: qrResult.error || 'Could not generate QR' }, { status: 500 });
}

async function handleConnect(body: any) {
  const { instance_id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instance_id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const result = await connectEvolution(instance);
  return NextResponse.json(result);
}

async function handleDisconnect(body: any) {
  const { instance_id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instance_id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  await disconnectEvolution(instance);

  await supabase
    .from('whatsapp_instances')
    .update({
      status: 'disconnected',
      qr_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance_id);

  return NextResponse.json({ success: true });
}

async function handleStatus(body: any) {
  const { instance_id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instance_id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const status = await getEvolutionStatus(instance);
  return NextResponse.json(status);
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
      return { success: false, error: data.message || data.error || 'Failed to create instance' };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
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
          ],
        },
      }),
    });

    const data = await response.json();
    return { success: response.ok, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function getEvolutionQR(instance: any) {
  try {
    const apiUrl = instance.server_url || instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const response = await fetch(`${apiUrl}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: { 'apikey': apiKey },
    });

    const data = await response.json();

    if (data.instance?.state === 'open') {
      return { 
        connected: true, 
        phoneNumber: data.instance?.owner?.split('@')?.[0] || data.instance?.phoneNumber 
      };
    }

    if (data.base64) {
      return { qrcode: data.base64 };
    }
    
    if (data.code) {
      return { qrcode: data.code, needsConversion: true };
    }

    return { error: 'No QR code available', raw: data };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function getEvolutionStatus(instance: any) {
  try {
    const apiUrl = instance.server_url || instance.api_url || EVOLUTION_API_URL;
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
        
        phoneNumber = instanceInfo?.owner?.split('@')?.[0] || 
                      instanceInfo?.ownerJid?.split('@')?.[0] ||
                      instanceInfo?.phone ||
                      null;
      } catch (infoError) {
        console.warn('⚠️ Could not fetch instance info:', infoError);
      }
    }

    return {
      connected: isConnected,
      state: state,
      phoneNumber: phoneNumber,
    };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}

async function connectEvolution(instance: any) {
  try {
    const apiUrl = instance.server_url || instance.api_url || EVOLUTION_API_URL;
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
    const apiUrl = instance.server_url || instance.api_url || EVOLUTION_API_URL;
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
