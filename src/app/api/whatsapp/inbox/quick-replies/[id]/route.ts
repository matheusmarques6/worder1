import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// PUT /api/whatsapp/inbox/quick-replies/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { shortcut, title, content, category, mediaUrl, mediaType, isActive } = body

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (shortcut !== undefined) {
      updates.shortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`
    }
    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (category !== undefined) updates.category = category
    if (mediaUrl !== undefined) updates.media_url = mediaUrl
    if (mediaType !== undefined) updates.media_type = mediaType
    if (isActive !== undefined) updates.is_active = isActive

    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ quickReply: data })

  } catch (error) {
    console.error('Error updating quick reply:', error)
    return NextResponse.json({ error: 'Failed to update quick reply' }, { status: 500 })
  }
}

// DELETE /api/whatsapp/inbox/quick-replies/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { error } = await supabase
      .from('whatsapp_quick_replies')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting quick reply:', error)
    return NextResponse.json({ error: 'Failed to delete quick reply' }, { status: 500 })
  }
}

// POST /api/whatsapp/inbox/quick-replies/[id]/use - Registrar uso
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .update({
        use_count: supabase.rpc('increment', { x: 1 }),
        last_used_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      // Fallback se RPC não existir
      await supabase
        .from('whatsapp_quick_replies')
        .update({
          last_used_at: new Date().toISOString()
        })
        .eq('id', id)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error recording quick reply use:', error)
    return NextResponse.json({ error: 'Failed to record use' }, { status: 500 })
  }
}
