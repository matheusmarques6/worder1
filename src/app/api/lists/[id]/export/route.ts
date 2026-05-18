// GET /api/lists/:id/export — stream CSV of all members.
//
// Returns text/csv with content-disposition attachment. Includes the
// merchant-visible contact fields: email, first_name, last_name,
// phone, total_orders, total_spent, lifecycle_stage, added_at.
//
// No pagination here — exports everything in one response. For lists
// over ~250k rows the merchant should reach for the API directly with
// chunked offset reads.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function csvField(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...((memberships || []).map((m: any) => m.organization_id)),
  ])]

  const { data: list } = await supabaseAdmin
    .from('contact_lists')
    .select('id, name, organization_id')
    .eq('id', params.id)
    .in('organization_id', orgIds)
    .maybeSingle()
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Pull every member row + hydrated contact, paginating in 1k chunks
  // so we don't blow the PostgREST 1k default limit.
  const rows: string[] = []
  rows.push(['email','first_name','last_name','phone','total_orders','total_spent','lifecycle_stage','added_at'].join(','))

  const PAGE = 1000
  let offset = 0
  while (true) {
    const { data: members, error } = await supabaseAdmin
      .from('contact_list_members')
      .select('contact_id, added_at')
      .eq('list_id', params.id)
      .order('added_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!members || members.length === 0) break

    const ids = members.map((m: any) => m.contact_id)
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, phone, total_orders, total_spent, lifecycle_stage')
      .in('id', ids)
    const byId: Record<string, any> = {}
    for (const c of contacts || []) byId[c.id as string] = c

    for (const m of members) {
      const c = byId[(m as any).contact_id] || {}
      rows.push([
        csvField(c.email),
        csvField(c.first_name),
        csvField(c.last_name),
        csvField(c.phone),
        csvField(c.total_orders ?? 0),
        csvField(c.total_spent ?? 0),
        csvField(c.lifecycle_stage),
        csvField((m as any).added_at),
      ].join(','))
    }

    if (members.length < PAGE) break
    offset += PAGE
  }

  const filename = `${(list as any).name.replace(/[^a-z0-9-_]+/gi, '_')}-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(rows.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
