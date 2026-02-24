// =============================================
// FIX WEBHOOK - Corrigir configuração do webhook
// /api/whatsapp/fix-webhook
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');
  
  const results: any = {
    timestamp: new Date().toISOString(),
    webhook_url: `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`,
    steps: [],
  };

  try {
    // 1. Buscar instâncias no banco
    let query = supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('api_type', 'EVOLUTION');
    
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }
    
    const { data: instances, error: dbError } = await query;
    
    if (dbError) {
      results.steps.push({ step: 'fetch_db', error: dbError.message });
      return NextResponse.json(results, { status: 500 });
    }
    
    results.instances_found = instances?.length || 0;
    results.steps.push({ step: 'fetch_db', success: true, count: instances?.length });

    if (!instances || instances.length === 0) {
      results.message = 'Nenhuma instância encontrada';
      return NextResponse.json(results);
    }

    // 2. Para cada instância, verificar e corrigir webhook
    const instanceResults = [];
    
    for (const instance of instances) {
      const instResult: any = {
        id: instance.id,
        unique_id: instance.unique_id,
        status: instance.status,
        phone_number: instance.phone_number,
      };
      
      try {
        // 2a. Verificar status atual na Evolution
        const statusResponse = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instance.unique_id}`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });
        
        const statusData = await statusResponse.json();
        instResult.evolution_state = statusData.instance?.state || statusData.state || 'unknown';
        instResult.evolution_connected = statusData.instance?.state === 'open';
        
        // 2b. Verificar webhook atual
        const webhookResponse = await fetch(`${EVOLUTION_API_URL}/webhook/find/${instance.unique_id}`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });
        
        const webhookData = await webhookResponse.json();
        instResult.current_webhook = webhookData?.webhook?.url || webhookData?.url || 'not_configured';
        instResult.webhook_enabled = webhookData?.webhook?.enabled || false;
        
        const expectedUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook`;
        instResult.webhook_correct = instResult.current_webhook === expectedUrl;
        
        // 2c. Reconfigurar webhook se necessário
        if (!instResult.webhook_correct || !instResult.webhook_enabled) {
          const configResponse = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instance.unique_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              webhook: {
                enabled: true,
                url: expectedUrl,
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
          
          const configData = await configResponse.json();
          instResult.webhook_reconfigured = configResponse.ok;
          instResult.webhook_config_response = configData;
          
          // Atualizar no banco
          if (configResponse.ok) {
            await supabase
              .from('whatsapp_instances')
              .update({
                webhook_url: expectedUrl,
                webhook_configured: true,
                updated_at: new Date().toISOString(),
              })
              .eq('id', instance.id);
          }
        }
        
        // 2d. Atualizar status no banco se diferente
        const newStatus = instResult.evolution_connected ? 'connected' : 'disconnected';
        if (instance.status !== newStatus) {
          await supabase
            .from('whatsapp_instances')
            .update({
              status: newStatus,
              online_status: instResult.evolution_connected ? 'available' : 'unavailable',
              updated_at: new Date().toISOString(),
            })
            .eq('id', instance.id);
          instResult.status_updated = true;
        }
        
      } catch (instError: any) {
        instResult.error = instError.message;
      }
      
      instanceResults.push(instResult);
    }
    
    results.instances = instanceResults;
    results.summary = {
      total: instanceResults.length,
      connected: instanceResults.filter(i => i.evolution_connected).length,
      webhooks_correct: instanceResults.filter(i => i.webhook_correct).length,
      webhooks_reconfigured: instanceResults.filter(i => i.webhook_reconfigured).length,
    };
    
    return NextResponse.json(results);
  } catch (error: any) {
    results.error = error.message;
    return NextResponse.json(results, { status: 500 });
  }
}

// POST - Enviar mensagem de teste
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { instanceId, phoneNumber, message } = body;
    
    if (!instanceId || !phoneNumber || !message) {
      return NextResponse.json({ 
        error: 'instanceId, phoneNumber e message são obrigatórios' 
      }, { status: 400 });
    }
    
    // Buscar instância
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .single();
    
    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }
    
    const apiUrl = instance.api_url || EVOLUTION_API_URL;
    const apiKey = instance.api_key || EVOLUTION_API_KEY;
    
    // Enviar mensagem de teste
    const sendResponse = await fetch(`${apiUrl}/message/sendText/${instance.unique_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: phoneNumber,
        text: message,
      }),
    });
    
    const sendData = await sendResponse.json();
    
    return NextResponse.json({
      success: sendResponse.ok,
      instance: instance.unique_id,
      phone: phoneNumber,
      response: sendData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
