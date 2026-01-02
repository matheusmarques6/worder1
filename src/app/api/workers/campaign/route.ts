import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// Usar service role para bypassa RLS

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

// POST - Processar campanhas (chamado por cron job)
export async function POST(request: NextRequest) {
  try {
    // Verificar auth (pode ser API key do cron)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'worder-cron-secret';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar campanhas em execução
    const { data: campaigns, error: campError } = await supabase
      .from('whatsapp_campaigns')
      .select('*')
      .in('status', ['RUNNING', 'SCHEDULED'])
      .order('created_at', { ascending: true });

    if (campError) throw campError;

    const results = [];

    for (const campaign of campaigns || []) {
      // Verificar se é agendada e ainda não chegou a hora
      if (campaign.status === 'SCHEDULED' && campaign.scheduled_at) {
        const scheduledTime = new Date(campaign.scheduled_at);
        if (scheduledTime > new Date()) {
          continue; // Ainda não é hora
        }
        
        // Atualizar para RUNNING
        await supabase
          .from('whatsapp_campaigns')
          .update({ status: 'RUNNING', started_at: new Date().toISOString() })
          .eq('id', campaign.id);
      }

      // Processar envios pendentes
      const result = await processCampaign(campaign);
      results.push(result);
    }

    return NextResponse.json({ 
      processed: results.length,
      results 
    });
  } catch (error: any) {
    console.error('Campaign worker error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function processCampaign(campaign: any) {
  const batchSize = 10; // Processar 10 por vez
  const interval = campaign.send_interval_ms || 1000;

  try {
    // Buscar config WhatsApp da organização
    const { data: waConfig } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('organization_id', campaign.organization_id)
      .eq('is_active', true)
      .single();

    if (!waConfig) {
      await supabase
        .from('whatsapp_campaigns')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', campaign.id);
      
      return { campaign_id: campaign.id, error: 'WhatsApp not configured' };
    }

    // Buscar logs pendentes
    const { data: pendingLogs } = await supabase
      .from('whatsapp_campaign_logs')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (!pendingLogs || pendingLogs.length === 0) {
      // Campanha concluída
      await supabase
        .from('whatsapp_campaigns')
        .update({ 
          status: 'COMPLETED', 
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        })
        .eq('id', campaign.id);

      return { campaign_id: campaign.id, status: 'completed' };
    }

    let sent = 0, failed = 0;

    for (const log of pendingLogs) {
      try {
        // Preparar componentes do template
        const components = [];

        // Header variable (se houver)
        if (campaign.header_variable) {
          components.push({
            type: 'header',
            parameters: [{ type: 'text', text: replaceVariables(campaign.header_variable, log) }]
          });
        }

        // Body variables
        if (campaign.body_variables && campaign.body_variables.length > 0) {
          components.push({
            type: 'body',
            parameters: campaign.body_variables.map((v: string) => ({
              type: 'text',
              text: replaceVariables(v, log)
            }))
          });
        }

        // Enviar para Meta API
        const payload = {
          messaging_product: 'whatsapp',
          to: log.contact_mobile,
          type: 'template',
          template: {
            name: campaign.template_name,
            language: { code: campaign.template_language },
            components: components.length > 0 ? components : undefined,
          },
        };

        const response = await fetch(
          `${WHATSAPP_API_URL}/${waConfig.phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${waConfig.access_token}`,
            },
            body: JSON.stringify(payload),
          }
        );

        const result = await response.json();

        if (response.ok && result.messages?.[0]?.id) {
          // Sucesso
          await supabase
            .from('whatsapp_campaign_logs')
            .update({
              status: 'SENT',
              meta_message_id: result.messages[0].id,
              delivery_time: new Date().toISOString(),
            })
            .eq('id', log.id);

          await supabase.rpc('increment_campaign_sent', { p_campaign_id: campaign.id });
          sent++;
        } else {
          // Erro
          await supabase
            .from('whatsapp_campaign_logs')
            .update({
              status: 'FAILED',
              error_message: result.error?.message || 'Unknown error',
              error_code: result.error?.code?.toString(),
            })
            .eq('id', log.id);

          await supabase.rpc('increment_campaign_failed', { p_campaign_id: campaign.id });
          failed++;
        }

        // Aguardar intervalo
        await sleep(interval);

      } catch (err: any) {
        console.error(`Error sending to ${log.contact_mobile}:`, err);
        
        await supabase
          .from('whatsapp_campaign_logs')
          .update({
            status: 'FAILED',
            error_message: err.message,
          })
          .eq('id', log.id);

        await supabase.rpc('increment_campaign_failed', { p_campaign_id: campaign.id });
        failed++;
      }
    }

    return { 
      campaign_id: campaign.id, 
      processed: pendingLogs.length,
      sent,
      failed 
    };

  } catch (error: any) {
    console.error(`Campaign ${campaign.id} error:`, error);
    return { campaign_id: campaign.id, error: error.message };
  }
}

// Substituir variáveis no texto
function replaceVariables(text: string, log: any): string {
  if (!text) return '';
  
  return text
    .replace(/\{\{name\}\}/gi, log.contact_name || '')
    .replace(/\{\{phone\}\}/gi, log.contact_mobile || '')
    .replace(/\{\{1\}\}/g, log.contact_name || '')
    .replace(/\{\{2\}\}/g, log.contact_mobile || '');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// GET - Status das campanhas (para debug)
export async function GET(request: NextRequest) {
  try {
    const { data: campaigns } = await supabase
      .from('whatsapp_campaigns')
      .select('id, title, status, sent_count, failed_count, total_contacts')
      .in('status', ['RUNNING', 'SCHEDULED', 'PAUSED'])
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({ campaigns: campaigns || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
