import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json().catch(() => ({}));
    const action = (body as any).action || 'pause';

    if (action === 'pause') {
      const { data, error } = await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'paused', paused_at: new Date().toISOString() })
        .eq('id', campaignId)
        .eq('organization_id', organizationId)
        .in('status', ['scheduled', 'sending'])
        .select('id, name, status');

      if (error || !data?.length) {
        return NextResponse.json(
          { error: 'Campaign not found or not in a pausable state' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, campaign: data[0] });
    }

    if (action === 'resume') {
      const { data: campaign } = await supabaseAdmin
        .from('email_campaigns')
        .select('id, scheduled_at')
        .eq('id', campaignId)
        .eq('organization_id', organizationId)
        .eq('status', 'paused')
        .single();

      if (!campaign) {
        return NextResponse.json(
          { error: 'Campaign not found or not paused' },
          { status: 404 }
        );
      }

      const resumeStatus = campaign.scheduled_at ? 'scheduled' : 'draft';
      const { data, error } = await supabaseAdmin
        .from('email_campaigns')
        .update({ status: resumeStatus, paused_at: null })
        .eq('id', campaignId)
        .select('id, name, status');

      if (error || !data?.length) {
        return NextResponse.json({ error: 'Failed to resume' }, { status: 500 });
      }

      return NextResponse.json({ success: true, campaign: data[0] });
    }

    return NextResponse.json({ error: 'Invalid action. Use "pause" or "resume".' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
