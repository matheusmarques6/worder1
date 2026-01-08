import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// ============================================
// HELPERS
// ============================================

function generateWebhookToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// ============================================
// GET - List webhooks for automation
// ============================================

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const automationId = searchParams.get('automationId');
  const webhookId = searchParams.get('id');

  try {
    // Get single webhook
    if (webhookId) {
      const { data, error } = await supabase
        .from('flow_webhooks')
        .select(`
          id,
          automation_id,
          node_id,
          token,
          secret,
          name,
          status,
          received_count,
          last_received_at,
          created_at
        `)
        .eq('id', webhookId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;

      // Build URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const url = `${baseUrl}/api/webhooks/flow/${data.token}`;

      return NextResponse.json({ 
        webhook: { ...data, url } 
      });
    }

    // List webhooks for automation
    if (automationId) {
      const { data, error } = await supabase
        .from('flow_webhooks')
        .select(`
          id,
          automation_id,
          node_id,
          token,
          name,
          status,
          received_count,
          last_received_at,
          created_at
        `)
        .eq('automation_id', automationId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Build URLs
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const webhooksWithUrls = (data || []).map(w => ({
        ...w,
        url: `${baseUrl}/api/webhooks/flow/${w.token}`,
      }));

      return NextResponse.json({ webhooks: webhooksWithUrls });
    }

    return NextResponse.json({ error: 'automationId or id required' }, { status: 400 });

  } catch (error: any) {
    console.error('Webhooks GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// POST - Create webhook for automation
// ============================================

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { automationId, nodeId, name } = body;

    if (!automationId) {
      return NextResponse.json({ error: 'automationId is required' }, { status: 400 });
    }

    // Verify automation belongs to organization
    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .select('id, name')
      .eq('id', automationId)
      .eq('organization_id', organizationId)
      .single();

    if (automationError || !automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Generate token and secret
    const token = generateWebhookToken();
    const secret = generateWebhookSecret();

    // Create webhook
    const { data, error } = await supabase
      .from('flow_webhooks')
      .insert({
        organization_id: organizationId,
        automation_id: automationId,
        node_id: nodeId || null,
        name: name || `Webhook - ${automation.name}`,
        token,
        secret,
        status: 'active',
        received_count: 0,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Build URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/webhooks/flow/${token}`;

    return NextResponse.json({
      webhook: {
        id: data.id,
        automationId: data.automation_id,
        nodeId: data.node_id,
        name: data.name,
        url,
        token,
        secret,
        status: data.status,
      },
    }, { status: 201 });

  } catch (error: any) {
    console.error('Webhooks POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// PUT - Update webhook
// ============================================

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { id, name, status, regenerateSecret } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    if (regenerateSecret) updates.secret = generateWebhookSecret();

    const { data, error } = await supabase
      .from('flow_webhooks')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    // Build URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/webhooks/flow/${data.token}`;

    return NextResponse.json({
      webhook: { ...data, url },
    });

  } catch (error: any) {
    console.error('Webhooks PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// DELETE - Delete webhook
// ============================================

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('flow_webhooks')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Webhooks DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
