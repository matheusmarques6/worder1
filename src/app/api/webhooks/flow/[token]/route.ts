import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyWebhookSignature } from '@/lib/automation/credential-encryption';

// ============================================
// DYNAMIC WEBHOOK HANDLER
// Route: /api/webhooks/flow/[token]
// ============================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// POST - Receive webhook
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  try {
    // Find webhook by token
    const { data: webhook, error } = await supabase
      .from('flow_webhooks')
      .select('*, automations(*)')
      .eq('token', token)
      .eq('status', 'active')
      .single();

    if (error || !webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Verify signature if secret is set
    const signature = request.headers.get('x-webhook-signature') || 
                     request.headers.get('x-hub-signature-256');
    
    if (webhook.secret && signature) {
      const rawBody = await request.text();
      const isValid = verifyWebhookSignature(rawBody, signature.replace('sha256=', ''), webhook.secret);
      
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Parse body
    let payload;
    try {
      payload = await request.clone().json();
    } catch {
      payload = await request.text();
    }

    // Get headers and query params
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const queryParams: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    // Log webhook received
    const { data: log } = await supabase
      .from('flow_webhook_logs')
      .insert({
        webhook_id: webhook.id,
        payload,
        headers,
        query_params: queryParams,
        ip_address: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown',
        processed: false,
      })
      .select()
      .single();

    // Check if automation is active
    if (webhook.automations?.status !== 'active') {
      return NextResponse.json({ 
        received: true, 
        message: 'Automation is not active',
        logId: log?.id,
      });
    }

    // Trigger automation execution via QStash or directly
    if (process.env.QSTASH_URL && process.env.QSTASH_TOKEN) {
      // Use QStash for async processing
      await fetch(`${process.env.QSTASH_URL}/v2/publish/${process.env.NEXT_PUBLIC_APP_URL}/api/workers/automation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'execute',
          automationId: webhook.automation_id,
          triggerData: {
            webhook: {
              id: webhook.id,
              nodeId: webhook.node_id,
              payload,
              headers,
              queryParams,
              receivedAt: new Date().toISOString(),
            },
          },
        }),
      });
    } else {
      // Execute directly (for development)
      const { executeWorkflow, Workflow } = await import('@/lib/automation/execution-engine');
      
      const workflow: Workflow = {
        id: webhook.automations.id,
        name: webhook.automations.name,
        nodes: webhook.automations.nodes || [],
        edges: webhook.automations.edges || [],
        settings: webhook.automations.settings,
      };

      // Fire and forget
      executeWorkflow(workflow, {
        triggerData: {
          webhook: {
            id: webhook.id,
            nodeId: webhook.node_id,
            payload,
            headers,
            queryParams,
            receivedAt: new Date().toISOString(),
          },
        },
      }).catch(console.error);
    }

    // Update log as processed
    if (log?.id) {
      await supabase
        .from('flow_webhook_logs')
        .update({ processed: true })
        .eq('id', log.id);
    }

    return NextResponse.json({ 
      received: true,
      logId: log?.id,
    });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// GET - Webhook verification (for some providers)
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  const searchParams = request.nextUrl.searchParams;

  // Handle Meta/Facebook webhook verification
  const mode = searchParams.get('hub.mode');
  const verifyToken = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && verifyToken && challenge) {
    // Verify the token
    const { data: webhook } = await supabase
      .from('flow_webhooks')
      .select('secret')
      .eq('token', token)
      .single();

    if (webhook?.secret === verifyToken) {
      return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }

  // Return webhook info
  const { data: webhook } = await supabase
    .from('flow_webhooks')
    .select('id, status, received_count, last_received_at')
    .eq('token', token)
    .single();

  if (!webhook) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }

  return NextResponse.json({
    active: webhook.status === 'active',
    receivedCount: webhook.received_count,
    lastReceivedAt: webhook.last_received_at,
  });
}
