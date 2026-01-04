import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// GET /api/whatsapp/inbox/quick-replies
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    let query = supabase
      .from('whatsapp_quick_replies')
      .select('*')
      .eq('organization_id', organizationId)
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
    const body = await request.json()
    const { 
      organizationId, 
      shortcut, 
      title, 
      content, 
      category,
      mediaUrl,
      mediaType,
      mediaFilename,
      userId 
    } = body

    if (!organizationId || !shortcut || !title || !content) {
      return NextResponse.json({ 
        error: 'Organization ID, shortcut, title and content required' 
      }, { status: 400 })
    }

    // Garante que shortcut começa com /
    const normalizedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`

    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .insert({
        organization_id: organizationId,
        shortcut: normalizedShortcut,
        title,
        content,
        category,
        media_url: mediaUrl,
        media_type: mediaType,
        media_filename: mediaFilename,
        created_by: userId,
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
