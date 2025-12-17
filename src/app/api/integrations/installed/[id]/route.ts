import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

// GET - Get single installed integration
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { data: installed, error } = await supabase
      .from('installed_integrations')
      .select(`
        *,
        integration:integrations(*)
      `)
      .eq('id', params.id)
      .single()

    if (error) throw error

    return NextResponse.json({ installed })
  } catch (error: any) {
    console.error('Error fetching installed integration:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update installed integration
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const allowedFields = [
      'status',
      'configuration',
      'default_pipeline_id',
      'default_stage_id',
      'auto_tags',
      'field_mapping',
    ]

    // Build update object with only allowed fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    for (const field of allowedFields) {
      // Convert camelCase to snake_case for some fields
      const camelField = field.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      } else if (body[camelField] !== undefined) {
        updateData[field] = body[camelField]
      }
    }

    const { data: installed, error } = await supabase
      .from('installed_integrations')
      .update(updateData)
      .eq('id', params.id)
      .select(`
        *,
        integration:integrations(*)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ installed })
  } catch (error: any) {
    console.error('Error updating installed integration:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Uninstall integration
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { error } = await supabase
      .from('installed_integrations')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error uninstalling integration:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
