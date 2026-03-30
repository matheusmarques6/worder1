import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const body = await request.json()

    const updateData: Record<string, any> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.category !== undefined) updateData.category = body.category

    const { data, error } = await supabaseAdmin
      .from('saved_blocks')
      .update(updateData)
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ block: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { error } = await supabaseAdmin
      .from('saved_blocks')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
