// =============================================
// API: /api/whatsapp/business-accounts
// Onda 3 E.4 — canonical Cloud-only read endpoint
// for the settings UI. Reads whatsapp_business_accounts
// (the table /api/whatsapp/connect now writes into) and
// returns the shape AccountsTab expects.
//
// Auth is mandatory (requireOrgFromAuth) so the route
// can't be probed for org metadata by an anonymous caller.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store_id')

  let query = supabaseAdmin
    .from('whatsapp_business_accounts')
    .select(
      'id, organization_id, store_id, phone_number_id, waba_id, phone_number, display_phone_number, verified_name, status, connection_method, webhook_configured, created_at, updated_at, last_health_check_at, last_health_status, last_health_error_code, last_health_expires_at'
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (storeId) {
    query = query.eq('store_id', storeId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[business-accounts] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Shape the response so AccountsTab can render without further mapping.
  const accounts = (data || []).map((row) => ({
    id: row.id,
    title: row.verified_name || 'WhatsApp Business',
    phone_number: row.display_phone_number || row.phone_number || null,
    phone_number_id: row.phone_number_id,
    waba_id: row.waba_id,
    status: row.status, // 'active' | 'inactive' | ...
    connection_method: row.connection_method, // 'manual' | 'embedded' | ...
    webhook_configured: !!row.webhook_configured,
    store_id: row.store_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_health_check_at: row.last_health_check_at ?? null,
    last_health_status: row.last_health_status ?? null,
    last_health_error_code: row.last_health_error_code ?? null,
    last_health_expires_at: row.last_health_expires_at ?? null,
  }))

  return NextResponse.json({ accounts })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const { orgId } = auth

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  // Soft-disconnect — keeps the row for telemetry/audit. Plan reserves
  // hard-delete for Onda 4 Fase G after backups age out.
  const { error } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('id', id)

  if (error) {
    console.error('[business-accounts] delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
