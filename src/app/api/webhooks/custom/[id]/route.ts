import { NextRequest, NextResponse } from 'next/server';
import { EventBus, EventType } from '@/lib/events';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function getSupabase() {
  return getSupabaseAdmin();
}

interface Params {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const webhookId = params.id;
    const supabase = getSupabase();
    
    // Buscar configuração do webhook
    const { data: webhook, error } = await supabase
      .from('automation_webhooks')
      .select(`
        *,
        automation:automations(
          id,
          organization_id,
          status
        )
      `)
      .eq('webhook_path', webhookId)
      .eq('is_active', true)
      .single();

    if (error || !webhook) {
      return NextResponse.json(
        { error: 'Webhook not found or inactive' },
        { status: 404 }
      );
    }

    if (webhook.automation?.status !== 'active') {
      return NextResponse.json(
        { error: 'Automation is not active' },
        { status: 400 }
      );
    }

    // Parsear body
    const body = await request.json();

    console.log(`[Custom Webhook] Received for automation ${webhook.automation.id}`);

    // Emitir evento
    await EventBus.emit(EventType.WEBHOOK_RECEIVED, {
      organization_id: webhook.automation.organization_id,
      email: body.email,
      phone: body.phone,
      contact_id: body.contact_id,
      data: {
        webhook_id: webhookId,
        automation_id: webhook.automation.id,
        payload: body,
      },
      source: 'custom_webhook',
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook processed',
      automation_id: webhook.automation.id,
    });
  } catch (error: any) {
    console.error('[Custom Webhook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const supabase = getSupabase();
  const { data: webhook } = await supabase
    .from('automation_webhooks')
    .select('*')
    .eq('webhook_path', params.id)
    .single();

  if (!webhook) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: 'ok',
    webhook_id: params.id,
    is_active: webhook.is_active,
  });
}
