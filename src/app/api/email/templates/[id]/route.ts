import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: template } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .single()

    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, template })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, category, design_json, html } = body

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .update({
        ...(name && { name }),
        ...(category && { category }),
        ...(design_json !== undefined && { design_json }),
        ...(html !== undefined && { html }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, template: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
