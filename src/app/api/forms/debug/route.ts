// =============================================
// GET /api/forms/debug
//
// Diagnostic endpoint: lists ALL forms in the user's organization with
// their store_id, status, and timestamps — regardless of which store the
// user has selected. Use this when a popup is invisible from the regular
// /forms list to figure out where it actually got saved.
//
// Returns: { user, currentOrgForms, storesInOrg }
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const admin = getSupabaseAdmin();

  const [{ data: forms }, { data: stores }] = await Promise.all([
    admin
      .from('crm_forms')
      .select('id, name, status, store_id, form_type, organization_id, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    admin
      .from('shopify_stores')
      .select('id, shop_domain, shop_name, organization_id, is_active')
      .eq('organization_id', orgId),
  ]);

  return NextResponse.json({
    user: { id: auth.user.id, email: auth.user.email, organization_id: orgId },
    storesInOrg: stores || [],
    currentOrgForms: forms || [],
    formsCount: (forms || []).length,
    orphanFormsCount: (forms || []).filter(f => !f.store_id).length,
  });
}
