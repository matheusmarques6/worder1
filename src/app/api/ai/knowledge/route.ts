import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-route';


async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  return data?.organization_id
}

// GET - Lista bases de conhecimento
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgId(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: knowledgeBases, error } = await supabase
      .from('knowledge_bases')
      .select(`
        id,
        name,
        description,
        is_active,
        embedding_model,
        chunk_size,
        chunk_overlap,
        created_at,
        updated_at
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      // Tabela não existe, retornar array vazio
      if (error.code === '42P01') {
        return NextResponse.json({ knowledge_bases: [] })
      }
      throw error
    }

    // Contar documentos para cada base
    const basesWithCounts = await Promise.all(
      (knowledgeBases || []).map(async (kb: any) => {
        const { count } = await supabase
          .from('knowledge_documents')
          .select('*', { count: 'exact', head: true })
          .eq('knowledge_base_id', kb.id)

        return {
          ...kb,
          documents_count: count || 0,
        }
      })
    )

    return NextResponse.json({ knowledge_bases: basesWithCounts })

  } catch (error: any) {
    console.error('Error fetching knowledge bases:', error)
    return NextResponse.json({ knowledge_bases: [], error: error.message })
  }
}

// POST - Criar base de conhecimento
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgId(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      embedding_model = 'text-embedding-3-small',
      chunk_size = 500,
      chunk_overlap = 50,
    } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('knowledge_bases')
      .insert({
        organization_id: orgId,
        name,
        description,
        embedding_model,
        chunk_size,
        chunk_overlap,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      // Tabela não existe
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: 'Tabela de knowledge_bases não existe. Execute as migrations.' },
          { status: 500 }
        )
      }
      throw error
    }

    return NextResponse.json({ knowledge_base: data }, { status: 201 })

  } catch (error: any) {
    console.error('Error creating knowledge base:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover base de conhecimento
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgId(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Deletar chunks primeiro
    await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('knowledge_base_id', id)

    // Deletar documentos
    await supabase
      .from('knowledge_documents')
      .delete()
      .eq('knowledge_base_id', id)

    // Deletar base
    const { error } = await supabase
      .from('knowledge_bases')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error deleting knowledge base:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
