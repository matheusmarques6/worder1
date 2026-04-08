import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { data, error } = await supabaseAdmin
      .from('brand_kits')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ brandKit: data || null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const body = await request.json()
    const orgId = auth.user.organization_id

    const { data, error } = await supabaseAdmin
      .from('brand_kits')
      .upsert({
        organization_id: orgId,
        logo_url: body.logo_url || null,
        colors: body.colors || {},
        fonts: body.fonts || {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ brandKit: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
