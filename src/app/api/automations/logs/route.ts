// =============================================
// Automation Logs API
// src/app/api/automations/logs/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const source = searchParams.get('source')
  const days = searchParams.get('days')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    // RLS filtra automaticamente por organization_id
    let query = supabase
      .from('automation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    // Filters
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (source && source !== 'all') {
      query = query.eq('source_type', source)
    }

    if (days && days !== 'all') {
      const daysAgo = new Date()
      daysAgo.setDate(daysAgo.getDate() - parseInt(days))
      query = query.gte('created_at', daysAgo.toISOString())
    }

    if (search) {
      query = query.or(`message.ilike.%${search}%,rule_name.ilike.%${search}%,event_type.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ logs: data || [] })
  } catch (error: any) {
    console.error('Error fetching automation logs:', error)
    if (error.code === '42P01') {
      return NextResponse.json({ logs: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create log entry (used by automation engine)
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const body = await request.json()
    const {
      rule_id,
      rule_name,
      source_type,
      event_type,
      status,
      message,
      error_message,
      deal_id,
      contact_id,
      metadata,
    } = body

    if (!source_type || !event_type || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Usa organization_id do usuário autenticado
    const { data, error } = await supabase
      .from('automation_logs')
      .insert({
        organization_id: user.organization_id,
        rule_id,
        rule_name,
        source_type,
        event_type,
        status,
        message: message || '',
        error_message,
        deal_id,
        contact_id,
        metadata: metadata || {},
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ log: data })
  } catch (error: any) {
    console.error('Error creating automation log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
