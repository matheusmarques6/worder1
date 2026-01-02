// =============================================
// API: /api/whatsapp/instances - v8
// Gerenciar conexões QR Code (Evolution API)
// MELHORIAS: Webhook automático, logs detalhados, verificação
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// =============================================
// Evolution API Configuration
// =============================================
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';

// =============================================
// GET - Listar instâncias
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const instanceId = searchParams.get('id');
    const skipStatusCheck = searchParams.get('skipStatus') === 'true';

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
      if (data?.api_type === 'EVOLUTION' && !skipStatusCheck) {
        const status = await getEvolutionStatus(data);
        
        // Atualizar no banco se o status mudou
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

    // Listar todas
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Se não quiser verificar status (para performance), retorna direto
    if (skipStatusCheck || !data || data.length === 0) {
      return NextResponse.json({ instances: data || [] });
    }

    // Verificar status de cada instância Evolution em paralelo
    const instancesWithStatus = await Promise.all(
      data.map(async (instance) => {
        if (instance.api_type === 'EVOLUTION') {
          try {
            const status = await getEvolutionStatus(instance);
            const newStatus = status.connected ? 'connected' : 'disconnected';
            
            // Atualizar no banco se mudou
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
// POST - Criar instância, gerar QR, etc
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
      case 'configure_webhook':
        return handleConfigureWebhook(body);
      case 'check_webhook':
        return handleCheckWebhook(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('❌ Instances POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PATCH - Atualizar instância
// =============================================
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
    console.error('❌ Instances PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Remover instância
// =============================================
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

    // Se Evolution API, desconectar e deletar da Evolution
    if (instance?.api_type === 'EVOLUTION' && instance?.unique_id) {
      await disconnectEvolution(instance);
      await deleteEvolutionInstance(instance);
    }

    const { error } = await supabase
      .from('whatsapp_instances')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Instances DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// HANDLERS
// =============================================

async function handleCreate(body: any) {
  const { organization_id, title } = body;
  
  const api_url = body.api_url || EVOLUTION_API_URL;
  const api_key = body.api_key || EVOLUTION_API_KEY;

  if (!organization_id || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const uniqueId = `zapzap_${organization_id.slice(0, 8)}_${Date.now()}`;
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`;

  console.log(`🚀 Creating instance: ${uniqueId}`);
  console.log(`🔗 Webhook URL: ${webhookUrl}`);
  console.log(`🌐 Evolution API: ${api_url}`);

  // PASSO 1: Criar instância na Evolution API
  const evolutionResult = await createEvolutionInstance({
    apiUrl: api_url,
    apiKey: api_key,
    instanceName: uniqueId,
  });

  if (!evolutionResult.success) {
    console.error('❌ Failed to create Evolution instance:', evolutionResult.error);
    return NextResponse.json({ error: evolutionResult.error }, { status: 400 });
  }

  console.log('✅ Evolution instance created');

  // PASSO 2: Configurar Webhook AUTOMATICAMENTE
  const webhookResult = await configureEvolutionWebhook({
    apiUrl: api_url,
    apiKey: api_key,
    instanceName: uniqueId,
    webhookUrl,
  });

  if (!webhookResult.success) {
    console.warn('⚠️ Webhook config failed, but continuing:', webhookResult.error);
  } else {
    console.log('✅ Webhook configured automatically');
  }

  // PASSO 3: Verificar se webhook foi configurado
  const webhookCheck = await checkEvolutionWebhook({
    apiUrl: api_url,
    apiKey: api_key,
    instanceName: uniqueId,
  });
  console.log('🔍 Webhook verification:', webhookCheck);

  // PASSO 4: Salvar no banco
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert({
      organization_id,
      title,
      unique_id: uniqueId,
      api_type: 'EVOLUTION',
      api_url,
      api_key,
      status: 'disconnected',
      online_status: 'unavailable',
      webhook_url: webhookUrl,
      webhook_configured: webhookResult.success,
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Database error:', error);
    // Tentar deletar instância da Evolution se falhou no banco
    await deleteEvolutionInstance({ api_url, api_key, unique_id: uniqueId });
    throw error;
  }

  console.log('✅ Instance saved to database:', data.id);

  // PASSO 5: Gerar QR Code automaticamente
  const qrResult = await getEvolutionQR({ ...data, api_url, api_key });

  return NextResponse.json({ 
    instance: data, 
    qr_code: qrResult.qrcode || null,
    qr: qrResult.qrcode || null, // compatibilidade
    webhook_configured: webhookResult.success,
    webhook_url: webhookUrl,
  });
}

async function handleGenerateQR(body: any) {
  const { id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  console.log(`📱 Generating QR for: ${instance.unique_id}`);

  // Primeiro verificar se já está conectado
  const status = await getEvolutionStatus(instance);
  if (status.connected) {
    return NextResponse.json({ 
      connected: true, 
      phoneNumber: status.phoneNumber,
      message: 'Already connected'
    });
  }

  // Gerar QR
  const qrResult = await getEvolutionQR(instance);
  
  if (qrResult.connected) {
    // Atualizar status
    await supabase
      .from('whatsapp_instances')
      .update({ 
        status: 'connected',
        online_status: 'available',
        phone_number: qrResult.phoneNumber,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id);

    return NextResponse.json({ 
      connected: true, 
      phoneNumber: qrResult.phoneNumber 
    });
  }

  if (qrResult.qrcode) {
    // Atualizar QR no banco para referência
    await supabase
      .from('whatsapp_instances')
      .update({ 
        status: 'generating',
        qr_code: qrResult.qrcode,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id);

    // Retornar no formato que o frontend espera
    return NextResponse.json({ 
      qr_code: qrResult.qrcode,
      qrcode: qrResult.qrcode, // compatibilidade
      needsConversion: qrResult.needsConversion 
    });
  }

  return NextResponse.json({ 
    error: qrResult.error || 'Could not generate QR code' 
  }, { status: 400 });
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

  // Chamar connect na Evolution
  const connectResult = await connectEvolution(instance);
  
  return NextResponse.json(connectResult);
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

  await disconnectEvolution(instance);
  
  await supabase
    .from('whatsapp_instances')
    .update({ 
      status: 'disconnected',
      online_status: 'unavailable',
      updated_at: new Date().toISOString() 
    })
    .eq('id', id);

  return NextResponse.json({ success: true });
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

  const status = await getEvolutionStatus(instance);
  
  console.log(`📊 Status for ${instance.unique_id}:`, status);
  
  // Atualizar no banco
  const updateData: any = { 
    status: status.connected ? 'connected' : 'disconnected',
    online_status: status.connected ? 'available' : 'unavailable',
    updated_at: new Date().toISOString() 
  };
  
  if (status.phoneNumber) {
    updateData.phone_number = status.phoneNumber;
  }
  
  await supabase
    .from('whatsapp_instances')
    .update(updateData)
    .eq('id', id);

  return NextResponse.json(status);
}

// Configurar webhook manualmente (caso falhe na criação)
async function handleConfigureWebhook(body: any) {
  const { id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`;
  
  const result = await configureEvolutionWebhook({
    apiUrl: instance.api_url || EVOLUTION_API_URL,
    apiKey: instance.api_key || EVOLUTION_API_KEY,
    instanceName: instance.unique_id,
    webhookUrl,
  });

  if (result.success) {
    await supabase
      .from('whatsapp_instances')
      .update({ 
        webhook_url: webhookUrl,
        webhook_configured: true,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id);
  }

  return NextResponse.json({
    success: result.success,
    webhook_url: webhookUrl,
    error: result.error,
  });
}

// Verificar configuração do webhook
async function handleCheckWebhook(body: any) {
  const { id } = body;

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const result = await checkEvolutionWebhook({
    apiUrl: instance.api_url || EVOLUTION_API_URL,
    apiKey: instance.api_key || EVOLUTION_API_KEY,
    instanceName: instance.unique_id,
  });

  return NextResponse.json(result);
}

// =============================================
// EVOLUTION API HELPERS
// =============================================

async function createEvolutionInstance(params: { apiUrl: string; apiKey: string; instanceName: string }) {
  try {
    console.log(`🔄 Creating Evolution instance: ${params.instanceName}`);
    
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
    console.log('📥 Evolution create response:', data);

    if (!response.ok) {
      return { success: false, error: data.message || data.error || 'Failed to create instance' };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('❌ createEvolutionInstance error:', error);
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
    console.log(`🔗 Configuring webhook for ${params.instanceName} -> ${params.webhookUrl}`);
    
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
    console.log('📥 Webhook config response:', data);
    
    return { success: response.ok, data };
  } catch (error: any) {
    console.error('❌ configureEvolutionWebhook error:', error);
    return { success: false, error: error.message };
  }
}

async function checkEvolutionWebhook(params: { apiUrl: string; apiKey: string; instanceName: string }) {
  try {
    const response = await fetch(`${params.apiUrl}/webhook/find/${params.instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': params.apiKey,
      },
    });

    const data = await response.json();
    console.log('🔍 Webhook check response:', data);
    
    return { 
      configured: !!data?.webhook?.enabled,
      url: data?.webhook?.url,
      events: data?.webhook?.events,
      raw: data,
    };
  } catch (error: any) {
    console.error('❌ checkEvolutionWebhook error:', error);
    return { configured: false, error: error.message };
  }
}

async function getEvolutionQR(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    console.log(`📱 Getting QR for: ${instance.unique_id}`);
    
    const response = await fetch(`${apiUrl}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
      },
    });

    const data = await response.json();
    console.log('📥 QR Response:', JSON.stringify(data, null, 2));

    // Já conectado
    if (data.instance?.state === 'open') {
      return { 
        connected: true, 
        phoneNumber: data.instance?.owner?.split('@')?.[0] || data.instance?.phoneNumber 
      };
    }

    // QR em base64
    if (data.base64) {
      return { qrcode: data.base64 };
    }
    
    // QR em formato string (precisa converter)
    if (data.code) {
      return { qrcode: data.code, needsConversion: true };
    }

    // QR no pairingCode
    if (data.pairingCode) {
      return { qrcode: data.pairingCode, needsConversion: true };
    }

    return { error: 'No QR code available', raw: data };
  } catch (error: any) {
    console.error('❌ getEvolutionQR error:', error);
    return { error: error.message };
  }
}

async function getEvolutionStatus(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    // 1. Verificar estado da conexão
    const stateResponse = await fetch(`${apiUrl}/instance/connectionState/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
      },
    });

    const stateData = await stateResponse.json();
    
    const state = stateData.instance?.state || stateData.state;
    const isConnected = state === 'open';

    // 2. Se conectado, buscar número do telefone
    let phoneNumber = stateData.instance?.phoneNumber || stateData.phoneNumber || null;

    if (isConnected && !phoneNumber) {
      try {
        const infoResponse = await fetch(`${apiUrl}/instance/fetchInstances?instanceName=${instance.unique_id}`, {
          method: 'GET',
          headers: {
            'apikey': apiKey,
          },
        });

        const infoData = await infoResponse.json();
        const instanceInfo = Array.isArray(infoData) ? infoData[0] : infoData;
        
        phoneNumber = instanceInfo?.owner?.split('@')?.[0] || 
                      instanceInfo?.ownerJid?.split('@')?.[0] ||
                      instanceInfo?.profilePicUrl?.split('/')?.[4] ||
                      instanceInfo?.phone ||
                      instanceInfo?.wuid?.split('@')?.[0] ||
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

async function deleteEvolutionInstance(instance: any) {
  try {
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    const response = await fetch(`${apiUrl}/instance/delete/${instance.unique_id}`, {
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
