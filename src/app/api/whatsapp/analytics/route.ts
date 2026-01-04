import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const period = searchParams.get('period') || '7d';
    
    // Get message counts
    const { count: totalMessages } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const { count: totalConversations } = await supabase
      .from('whatsapp_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const { count: totalContacts } = await supabase
      .from('whatsapp_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    return NextResponse.json({
      metrics: {
        totalMessages: totalMessages || 0,
        totalConversations: totalConversations || 0,
        totalContacts: totalContacts || 0,
      }
    });
  } catch (error: any) {
    console.error('WhatsApp Analytics GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
