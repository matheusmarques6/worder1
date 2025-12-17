import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

// GET - List all available integrations (catalog)
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const categoryId = searchParams.get('categoryId')
  const search = searchParams.get('search')

  try {
    let query = supabase
      .from('integrations')
      .select(`
        *,
        category:integration_categories(*)
      `)
      .eq('is_active', true)
      .order('is_builtin', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('name')

    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,short_description.ilike.%${search}%`)
    }

    const { data: integrations, error } = await query

    if (error) throw error

    return NextResponse.json({ integrations: integrations || [] })
  } catch (error: any) {
    console.error('Error fetching integrations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
