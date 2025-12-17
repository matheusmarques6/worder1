import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

// GET - Lista campanhas
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const id = searchParams.get('id');

    if (id) {
      // Buscar campanha específica com logs
      const { data, error } = await supabase
        .from('whatsapp_campaigns')
        .select(`
          *,
          phonebook:phonebooks(*),
          logs:whatsapp_campaign_logs(*)
        `)
        .eq('id', id)
        .eq('organization_id', orgId)
        .single();

      if (error) throw error;
      return NextResponse.json({ campaign: data });
    }

    let query = supabase
      .from('whatsapp_campaigns')
      .select(`*, phonebook:phonebooks(id, name, contact_count)`)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ campaigns: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar campanha
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      title,
      template_name,
      template_language = 'pt_BR',
      phonebook_id,
      body_variables = [],
      header_variable,
      button_variables = [],
      media_url,
      scheduled_at,
      send_interval_ms = 1000,
    } = body;

    if (!title || !template_name || !phonebook_id) {
      return NextResponse.json({ 
        error: 'title, template_name, and phonebook_id are required' 
      }, { status: 400 });
    }

    // Buscar phonebook
    const { data: phonebook } = await supabase
      .from('phonebooks')
      .select('contact_count')
      .eq('id', phonebook_id)
      .eq('organization_id', orgId)
      .single();

    if (!phonebook) {
      return NextResponse.json({ error: 'Phonebook not found' }, { status: 404 });
    }

    const campaignId = `camp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const { data, error } = await supabase
      .from('whatsapp_campaigns')
      .insert({
        organization_id: orgId,
        campaign_id: campaignId,
        title,
        template_name,
        template_language,
        phonebook_id,
        body_variables,
        header_variable,
        button_variables,
        media_url,
        scheduled_at,
        send_interval_ms,
        total_contacts: phonebook.contact_count,
        status: scheduled_at ? 'SCHEDULED' : 'PENDING',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Controlar campanha (start, pause, cancel)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    let newStatus = campaign.status;
    let additionalData: any = {};

    switch (action) {
      case 'start':
        if (!['PENDING', 'PAUSED', 'SCHEDULED'].includes(campaign.status)) {
          return NextResponse.json({ error: 'Campaign cannot be started' }, { status: 400 });
        }
        newStatus = 'RUNNING';
        additionalData.started_at = new Date().toISOString();
        
        // Criar logs para cada contato
        const { data: contacts } = await supabase
          .from('phonebook_contacts')
          .select('id, name, mobile')
          .eq('phonebook_id', campaign.phonebook_id);

        if (contacts && contacts.length > 0) {
          const logs = contacts.map((c: any) => ({
            organization_id: orgId,
            campaign_id: id,
            contact_id: c.id,
            contact_name: c.name,
            contact_mobile: c.mobile,
            status: 'PENDING',
          }));
          
          await supabase.from('whatsapp_campaign_logs').insert(logs);
        }
        break;

      case 'pause':
        if (campaign.status !== 'RUNNING') {
          return NextResponse.json({ error: 'Campaign is not running' }, { status: 400 });
        }
        newStatus = 'PAUSED';
        break;

      case 'resume':
        if (campaign.status !== 'PAUSED') {
          return NextResponse.json({ error: 'Campaign is not paused' }, { status: 400 });
        }
        newStatus = 'RUNNING';
        break;

      case 'cancel':
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(campaign.status)) {
          return NextResponse.json({ error: 'Campaign already finished' }, { status: 400 });
        }
        newStatus = 'CANCELLED';
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_campaigns')
      .update({ 
        status: newStatus, 
        ...additionalData,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ campaign: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Deletar campanha
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });

    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('status')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (campaign?.status === 'RUNNING') {
      return NextResponse.json({ error: 'Cannot delete running campaign' }, { status: 400 });
    }

    await supabase.from('whatsapp_campaign_logs').delete().eq('campaign_id', id);
    await supabase.from('whatsapp_campaigns').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
