import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
export const dynamic = 'force-dynamic';

// Safe columns to return — NEVER expose secret columns like
// credentials_encrypted, oauth_access_token or webhook_token.
const SAFE_INSTALLED_COLUMNS = `
  id,
  organization_id,
  store_id,
  integration_id,
  status,
  configuration,
  default_pipeline_id,
  default_stage_id,
  auto_tags,
  field_mapping,
  last_sync_at,
  created_at,
  updated_at,
  integration:integrations(*)
`;

// GET - Get single installed integration
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const { supabase, user } = auth

  try {
    const { data: installed, error } = await supabase
      .from('installed_integrations')
      .select(SAFE_INSTALLED_COLUMNS)
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
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
  const auth = await getAuthClient()
  if (!auth) return authError()
  const { supabase, user } = auth

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
      .eq('organization_id', user.organization_id)
      .select(SAFE_INSTALLED_COLUMNS)
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
  const auth = await getAuthClient()
  if (!auth) return authError()
  const { supabase, user } = auth

  try {
    const { error } = await supabase
      .from('installed_integrations')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error uninstalling integration:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
