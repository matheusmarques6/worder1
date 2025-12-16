import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EventBus, EventType } from '@/lib/events';

// ============================================
// CONFIGURAÇÃO
// ============================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase not configured');
  }
  
  return createClient(url, key);
}

// ============================================
// BUSCAR ORGANIZAÇÃO
// ============================================

async function getOrganizationByKlaviyoAccount(accountId: string): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('klaviyo_accounts')
      .select('organization_id')
      .eq('account_id', accountId)
      .single();
    
    return data?.organization_id || null;
  } catch {
    return null;
  }
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Estrutura do webhook Klaviyo
    const { topic, data, account_id } = body;

    console.log(`[Klaviyo Webhook] Received: ${topic}`);

    // Buscar organização
    const organizationId = await getOrganizationByKlaviyoAccount(account_id);
    if (!organizationId) {
      console.warn(`[Klaviyo Webhook] No organization found for account: ${account_id}`);
      return NextResponse.json({ success: true });
    }

    switch (topic) {
      case 'email.opened':
        const contactOpened = await EventBus.getContactByEmail(organizationId, data.email);
        await EventBus.emit(EventType.EMAIL_OPENED, {
          organization_id: organizationId,
          contact_id: contactOpened?.id,
          email: data.email,
          data: {
            campaign_id: data.campaign_id,
            flow_id: data.flow_id,
            message_id: data.message_id,
            subject: data.subject,
            opened_at: data.timestamp,
          },
          source: 'klaviyo',
        });
        break;
        
      case 'email.clicked':
        const contactClicked = await EventBus.getContactByEmail(organizationId, data.email);
        await EventBus.emit(EventType.EMAIL_CLICKED, {
          organization_id: organizationId,
          contact_id: contactClicked?.id,
          email: data.email,
          data: {
            campaign_id: data.campaign_id,
            flow_id: data.flow_id,
            url: data.url,
            clicked_at: data.timestamp,
          },
          source: 'klaviyo',
        });
        break;
        
      case 'email.bounced':
        const contactBounced = await EventBus.getContactByEmail(organizationId, data.email);
        await EventBus.emit(EventType.EMAIL_BOUNCED, {
          organization_id: organizationId,
          contact_id: contactBounced?.id,
          email: data.email,
          data: { 
            bounce_type: data.bounce_type, 
            reason: data.reason 
          },
          source: 'klaviyo',
        });
        break;
        
      case 'profile.created':
        const contact = await EventBus.upsertContact(organizationId, {
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone_number,
          klaviyo_profile_id: data.id,
          source: 'klaviyo',
        });

        await EventBus.emit(EventType.CONTACT_CREATED, {
          organization_id: organizationId,
          contact_id: contact?.id,
          email: data.email,
          phone: data.phone_number,
          data: {
            klaviyo_profile_id: data.id,
            source: 'klaviyo',
          },
          source: 'klaviyo',
        });
        break;
        
      case 'profile.subscribed':
        const supabase = getSupabase();
        const contactSubscribed = await EventBus.getContactByEmail(organizationId, data.email);
        if (contactSubscribed) {
          await supabase
            .from('contacts')
            .update({ is_subscribed_email: true })
            .eq('id', contactSubscribed.id);
        }
        break;
        
      case 'profile.unsubscribed':
        const supabase2 = getSupabase();
        const contactUnsubscribed = await EventBus.getContactByEmail(organizationId, data.email);
        if (contactUnsubscribed) {
          await supabase2
            .from('contacts')
            .update({ is_subscribed_email: false })
            .eq('id', contactUnsubscribed.id);
        }
        break;
        
      default:
        console.log(`[Klaviyo Webhook] Unhandled topic: ${topic}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Klaviyo Webhook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'klaviyo-webhook' 
  });
}
