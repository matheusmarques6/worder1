import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
export const dynamic = 'force-dynamic';

// GET /api/whatsapp/inbox/quick-replies
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    let query = supabase
      .from('whatsapp_quick_replies')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('use_count', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`shortcut.ilike.%${search}%,title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ quickReplies: data || [] })

  } catch (error) {
    console.error('Error fetching quick replies:', error)
    return NextResponse.json({ error: 'Failed to fetch quick replies' }, { status: 500 })
  }
}

// POST /api/whatsapp/inbox/quick-replies
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId, userId: authUserId } = auth

    const body = await request.json()
    const {
      shortcut,
      title,
      content,
      category,
      mediaUrl,
      mediaType,
      mediaFilename,
    } = body

    if (!shortcut || !title || !content) {
      return NextResponse.json({
        error: 'shortcut, title and content required'
      }, { status: 400 })
    }

    // Garante que shortcut começa com /
    const normalizedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`

    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .insert({
        organization_id: orgId,
        shortcut: normalizedShortcut,
        title,
        content,
        category,
        media_url: mediaUrl,
        media_type: mediaType,
        media_filename: mediaFilename,
        created_by: authUserId,
        created_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') { // unique violation
        return NextResponse.json({ error: 'Shortcut already exists' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ quickReply: data })

  } catch (error) {
    console.error('Error creating quick reply:', error)
    return NextResponse.json({ error: 'Failed to create quick reply' }, { status: 500 })
  }
}
