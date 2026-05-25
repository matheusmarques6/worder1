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
    // Only allow retrying campaigns that are stuck in 'sending' or marked 'failed'
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('email_campaigns')
      .update({
        status: 'draft',
        sent_at: null,
        error_message: null,
      })
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .in('status', ['sending', 'failed'])
      .select('id, name, status')
      .single();

    if (updateErr || !updated) {
      return NextResponse.json(
        { error: 'Campaign not found or not in a retryable state (must be sending or failed)' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign: updated,
      message: 'Campaign reset to draft. You can now resend it.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
