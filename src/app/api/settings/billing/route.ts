import { NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({
        plan: 'free',
        emailsSent: 0,
        emailsLimit: 1000,
        nextBillingDate: null,
        billingEmail: null,
      });
    }
    const { data: org } = await supabase
      .from('organizations')
      .select('plan, billing_email, next_billing_date, email_settings')
      .eq('id', orgId)
      .single();

    const emailSettings = org?.email_settings || {};
    return NextResponse.json({
      plan: org?.plan || 'free',
      emailsSent: emailSettings.emails_sent_this_month || 0,
      emailsLimit: org?.plan === 'pro' ? 50000 : 1000,
      nextBillingDate: org?.next_billing_date || null,
      billingEmail: org?.billing_email || null,
    });
  } catch {
    return NextResponse.json({
      plan: 'free',
      emailsSent: 0,
      emailsLimit: 1000,
      nextBillingDate: null,
      billingEmail: null,
    });
  }
}
