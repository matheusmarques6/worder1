import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// GET - Get single contact
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const contactId = params.id

  try {
    // RLS filtra automaticamente por organization_id
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (error) throw error

    return NextResponse.json({ contact })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update contact
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const contactId = params.id
  const body = await request.json()
  const { organizationId, ...updates } = body

  try {
    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Standard fields that can be updated
    const allowedFields = [
      'first_name',
      'last_name', 
      'email',
      'phone',
      'company',
      'tags',
      'custom_fields',
      'avatar_url',
      'notes',
      'source',
    ]

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
      }
    }

    // Handle custom_fields merge if needed - RLS filtra automaticamente
    if (updates.custom_fields && updates.merge_custom_fields) {
      const { data: currentContact } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', contactId)
        .single()

      if (currentContact) {
        updateData.custom_fields = {
          ...(currentContact.custom_fields || {}),
          ...updates.custom_fields,
        }
      }
    }

    // RLS filtra automaticamente
    const { data: contact, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ contact })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const contactId = params.id

  try {
    // First, update any deals to remove contact_id - RLS filtra automaticamente
    await supabase
      .from('deals')
      .update({ contact_id: null })
      .eq('contact_id', contactId)

    // Delete the contact - RLS filtra automaticamente
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
