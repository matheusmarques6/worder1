import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// =============================================
// GET - List Chat Templates
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const storeId = searchParams.get('store_id')
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    let query = supabase
      .from('chat_templates')
      .select(`
        *,
        profiles:created_by (
          id,
          email,
          full_name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('usage_count', { ascending: false })

    if (storeId) {
      query = query.or(`store_id.eq.${storeId},store_id.is.null`)
    }

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,content.ilike.%${search}%`)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get categories with counts
    const { data: categoryCounts } = await supabase
      .from('chat_templates')
      .select('category')
      .eq('organization_id', organizationId)
      .eq('is_active', true)

    const categories: Record<string, number> = {}
    for (const t of categoryCounts || []) {
      categories[t.category] = (categories[t.category] || 0) + 1
    }

    return NextResponse.json({
      templates: templates || [],
      categories: Object.entries(categories).map(([name, count]) => ({ name, count })),
      total: templates?.length || 0,
    })
  } catch (error: any) {
    console.error('Chat Templates GET Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// POST - Create Chat Template
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      organization_id,
      store_id,
      created_by,
      name,
      category = 'general',
      content,
      variables = [],
      media_url,
      media_type,
    } = body

    if (!organization_id || !name || !content) {
      return NextResponse.json(
        { error: 'organization_id, name, and content are required' },
        { status: 400 }
      )
    }

    // Extract variables from content (e.g., {{nome}}, {{produto}})
    const extractedVars = content.match(/\{\{(\w+)\}\}/g) || []
    const allVariables = [...new Set([
      ...variables,
      ...extractedVars.map((v: string) => v.replace(/\{\{|\}\}/g, '')),
    ])]

    const { data: template, error } = await supabase
      .from('chat_templates')
      .insert({
        organization_id,
        store_id,
        created_by,
        name,
        category,
        content,
        variables: allVariables,
        media_url,
        media_type,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Chat Templates POST Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// PUT - Update Chat Template
// =============================================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Extract variables if content changed
    if (updates.content) {
      const extractedVars = updates.content.match(/\{\{(\w+)\}\}/g) || []
      updates.variables = [...new Set([
        ...(updates.variables || []),
        ...extractedVars.map((v: string) => v.replace(/\{\{|\}\}/g, '')),
      ])]
    }

    const { data: template, error } = await supabase
      .from('chat_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Chat Templates PUT Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// DELETE - Delete Chat Template
// =============================================
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Soft delete
    const { error } = await supabase
      .from('chat_templates')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Chat Templates DELETE Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
