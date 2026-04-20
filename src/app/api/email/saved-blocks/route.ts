import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { data, error } = await supabaseAdmin
      .from('saved_blocks')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ blocks: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const body = await request.json()
    if (!body.name || !body.block_json) {
      return NextResponse.json({ error: 'name and block_json are required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('saved_blocks')
      .insert({
        organization_id: auth.user.organization_id,
        name: body.name,
        category: body.category || 'custom',
        block_json: body.block_json,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ block: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
