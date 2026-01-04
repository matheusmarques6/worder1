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
    const { data, error } = await supabase
      .from('whatsapp_ai_interactions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const totalInteractions = data?.length || 0;
    const avgResponseTime = data?.reduce((sum, d) => sum + (d.response_time_ms || 0), 0) / totalInteractions || 0;
    const totalTokens = data?.reduce((sum, d) => sum + (d.tokens_used || 0), 0) || 0;

    return NextResponse.json({
      interactions: data || [],
      metrics: {
        totalInteractions,
        avgResponseTime: Math.round(avgResponseTime),
        totalTokens,
      }
    });
  } catch (error: any) {
    console.error('WhatsApp AI Analytics GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
