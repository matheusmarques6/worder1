// =============================================
// API: Business Hours
// GET/POST /api/whatsapp/business-hours
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // ✅ P1 v2: org do token; organizationId da query é IGNORADO
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')

    let query = supabaseAdmin
      .from('whatsapp_business_hours')
      .select('*')
      .eq('organization_id', organizationId)
      .order('day_of_week', { ascending: true })

    if (storeId) query = query.eq('store_id', storeId)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // ✅ P1 v2: org do token
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const body = await request.json()
    const { hours, storeId } = body

    if (!hours || !Array.isArray(hours)) {
      return NextResponse.json({ error: 'hours array required' }, { status: 400 })
    }

    // Upsert all days
    const records = hours.map((h: {
      day_of_week: number
      start_time: string
      end_time: string
      is_active: boolean
      timezone?: string
      out_of_hours_message?: string
      out_of_hours_bot_id?: string
      enable_auto_reply?: boolean
      enable_bot_outside_hours?: boolean
    }) => ({
      organization_id: organizationId,
      store_id: storeId,
      day_of_week: h.day_of_week,
      start_time: h.start_time,
      end_time: h.end_time,
      is_active: h.is_active,
      timezone: h.timezone || 'America/Sao_Paulo',
      out_of_hours_message: h.out_of_hours_message,
      out_of_hours_bot_id: h.out_of_hours_bot_id,
      enable_auto_reply: h.enable_auto_reply ?? true,
      enable_bot_outside_hours: h.enable_bot_outside_hours ?? false,
    }))

    const { data, error } = await supabaseAdmin
      .from('whatsapp_business_hours')
      .upsert(records, { onConflict: 'organization_id,store_id,day_of_week' })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
