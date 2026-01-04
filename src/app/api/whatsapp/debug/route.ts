// =============================================
// DEBUG ENDPOINT - Diagnóstico WhatsApp
// /api/whatsapp/debug
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  const instanceName = searchParams.get('instance');

  const results: any = {
    timestamp: new Date().toISOString(),
    action,
    environment: {
      EVOLUTION_API_URL: EVOLUTION_API_URL,
      WEBHOOK_BASE_URL: WEBHOOK_BASE_URL,
      HAS_API_KEY: !!EVOLUTION_API_KEY,
    },
  };

  try {
    switch (action) {
      case 'status':
        // Verificar se Evolution API está acessível
        results.evolution_api = await checkEvolutionAPI();
        break;

      case 'instances':
        // Listar todas as instâncias na Evolution
        results.evolution_instances = await listEvolutionInstances();
        break;

      case 'webhook':
        // Verificar webhook de uma instância específica
        if (!instanceName) {
          results.error = 'instance parameter required';
        } else {
          results.webhook = await checkInstanceWebhook(instanceName);
        }
        break;

      case 'configure_webhook':
        // Configurar webhook de uma instância
        if (!instanceName) {
          results.error = 'instance parameter required';
        } else {
          results.webhook_config = await configureInstanceWebhook(instanceName);
        }
        break;

      case 'full':
        // Diagnóstico completo
        results.evolution_api = await checkEvolutionAPI();
        results.evolution_instances = await listEvolutionInstances();
        results.database_instances = await listDatabaseInstances();
        break;

      default:
        results.error = 'Unknown action. Use: status, instances, webhook, configure_webhook, full';
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      ...results,
      error: error.message,
    }, { status: 500 });
  }
}

// POST - Ações de debug
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, instanceName } = body;

    const results: any = {
      timestamp: new Date().toISOString(),
      action,
    };

    switch (action) {
      case 'test_webhook':
        // Enviar evento de teste para o webhook
        results.test = await sendTestWebhook();
        break;

      case 'sync_instances':
        // Sincronizar instâncias Evolution com banco
        results.sync = await syncInstances();
        break;

      case 'fix_webhooks':
        // Configurar webhooks em todas as instâncias
        results.fix = await fixAllWebhooks();
        break;

      default:
        results.error = 'Unknown action. Use: test_webhook, sync_instances, fix_webhooks';
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// FUNÇÕES AUXILIARES
// =============================================

async function checkEvolutionAPI() {
  try {
    const response = await fetch(EVOLUTION_API_URL, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY,
      },
    });

    const data = await response.json();
    
    return {
      accessible: response.ok,
      status: response.status,
      response: data,
    };
  } catch (error: any) {
    return {
      accessible: false,
      error: error.message,
    };
  }
}

async function listEvolutionInstances() {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY,
      },
    });

    const data = await response.json();
    
    // Processar cada instância
    const instances = Array.isArray(data) ? data : [data];
    
    return instances.map((inst: any) => ({
      name: inst.instance?.instanceName || inst.instanceName,
      status: inst.instance?.status || inst.status,
      owner: inst.instance?.owner || inst.owner,
      profileName: inst.instance?.profileName || inst.profileName,
      connectionStatus: inst.instance?.connectionStatus || inst.connectionStatus,
    }));
  } catch (error: any) {
    return { error: error.message };
  }
}

async function listDatabaseInstances() {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('id, unique_id, title, status, phone_number, webhook_url, webhook_configured, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }

  return data;
}

async function checkInstanceWebhook(instanceName: string) {
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/webhook/find/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY,
      },
    });

    const data = await response.json();
    
    return {
      configured: !!data?.webhook?.enabled,
      url: data?.webhook?.url,
      events: data?.webhook?.events,
      expected_url: `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`,
      url_matches: data?.webhook?.url === `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`,
      raw: data,
    };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function configureInstanceWebhook(instanceName: string) {
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`;
  
  try {
    const response = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
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
    
    // Atualizar no banco também
    await supabase
      .from('whatsapp_instances')
      .update({
        webhook_url: webhookUrl,
        webhook_configured: true,
        updated_at: new Date().toISOString(),
      })
      .eq('unique_id', instanceName);

    return {
      success: response.ok,
      webhook_url: webhookUrl,
      response: data,
    };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function sendTestWebhook() {
  const testPayload = {
    event: 'TEST_WEBHOOK',
    instance: 'debug_test',
    data: {
      message: 'This is a test webhook from debug endpoint',
      timestamp: new Date().toISOString(),
    },
  };

  try {
    const response = await fetch(`${WEBHOOK_BASE_URL}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const data = await response.json();
    
    return {
      sent: true,
      status: response.status,
      response: data,
    };
  } catch (error: any) {
    return {
      sent: false,
      error: error.message,
    };
  }
}

async function syncInstances() {
  // Buscar instâncias da Evolution
  const evolutionInstances = await listEvolutionInstances();
  
  if (!Array.isArray(evolutionInstances)) {
    return { error: 'Could not fetch Evolution instances' };
  }

  const results = {
    synced: 0,
    created: 0,
    updated: 0,
    errors: [] as string[],
  };

  for (const evo of evolutionInstances) {
    if (!evo.name) continue;

    // Verificar se existe no banco
    const { data: existing } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('unique_id', evo.name)
      .single();

    if (existing) {
      // Atualizar status
      await supabase
        .from('whatsapp_instances')
        .update({
          status: evo.connectionStatus === 'open' ? 'connected' : 'disconnected',
          phone_number: evo.owner?.split('@')?.[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      
      results.updated++;
    }

    results.synced++;
  }

  return results;
}

async function fixAllWebhooks() {
  // Buscar todas as instâncias do banco
  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('unique_id, webhook_configured')
    .eq('api_type', 'EVOLUTION');

  if (!instances) {
    return { error: 'No instances found' };
  }

  const results = {
    total: instances.length,
    configured: 0,
    failed: 0,
    details: [] as any[],
  };

  for (const inst of instances) {
    const result = await configureInstanceWebhook(inst.unique_id);
    
    if (result.success) {
      results.configured++;
    } else {
      results.failed++;
    }
    
    results.details.push({
      instance: inst.unique_id,
      ...result,
    });
  }

  return results;
}
