// =============================================
// API: Opt-in/Opt-out Management
// GET/POST /api/whatsapp/opt-status
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('whatsapp_opt_status')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.ilike('phone', `%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get stats
    const { count: optedIn } = await supabaseAdmin
      .from('whatsapp_opt_status')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'opted_in')

    const { count: optedOut } = await supabaseAdmin
      .from('whatsapp_opt_status')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'opted_out')

    return NextResponse.json({
      data,
      stats: {
        total: count || 0,
        opted_in: optedIn || 0,
        opted_out: optedOut || 0,
        rate: count ? ((optedIn || 0) / count * 100).toFixed(1) : '0',
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const body = await request.json()
    const { phone, status, contactId, source, reason } = body

    if (!phone || !status) {
      return NextResponse.json({ error: 'phone and status required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('whatsapp_opt_status')
      .upsert(
        {
          organization_id: organizationId,
          phone,
          contact_id: contactId,
          status,
          opted_in_at: status === 'opted_in' ? now : undefined,
          opted_out_at: status === 'opted_out' ? now : undefined,
          opt_in_source: source || 'manual',
          opt_out_reason: reason,
        },
        { onConflict: 'organization_id,phone' }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
