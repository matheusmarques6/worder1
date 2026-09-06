import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { requireOrgFromAuth } from '@/lib/auth/require-org';

// Lazy service-role client — created only when the handler runs so a
// missing env var at build/import time doesn't throw.
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

// =============================================
// GET - List Chat Templates
// =============================================
export async function GET(request: NextRequest) {
  // A organização vinha no pedido e nada exigia sessão: qualquer um
  // lia e escrevia na organização que quisesse, só informando o id.
  // Agora ela vem do token.
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('store_id')
    const category = searchParams.get('category')
    const search = searchParams.get('search')


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
      query = query.eq('store_id', storeId)
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
  // A organização vinha no pedido e nada exigia sessão: qualquer um
  // lia e escrevia na organização que quisesse, só informando o id.
  // Agora ela vem do token.
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organization_id = auth.orgId;

  try {
    const supabase = getSupabase()
    const body = await request.json()
    const {
      store_id,
      created_by,
      name,
      category = 'general',
      content,
      variables = [],
      media_url,
      media_type,
    } = body

    if (!name || !content) {
      return NextResponse.json(
        { error: 'name and content are required' },
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
  // Editar e apagar iam pelo id, com a chave de serviço e sem sessão:
  // qualquer um mexia no modelo de qualquer organização.
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const supabase = getSupabase()
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
      .eq('organization_id', organizationId)
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
  // Editar e apagar iam pelo id, com a chave de serviço e sem sessão:
  // qualquer um mexia no modelo de qualquer organização.
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  try {
    const supabase = getSupabase()
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
      .eq('organization_id', organizationId)

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
