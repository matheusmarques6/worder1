import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
export const dynamic = 'force-dynamic';

// GET - Buscar preferências do usuário
export async function GET(request: NextRequest) {
  try {
    // Derive identity from the SESSION — ignore any client-supplied ids.
    const auth = await getAuthClient()
    if (!auth) return authError()

    const organizationId = auth.user.organization_id
    const userId = auth.user.id

    let { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single()
    
    if (error && error.code === 'PGRST116') {
      const { data: newPrefs, error: insertError } = await supabase
        .from('notification_preferences')
        .insert({ user_id: userId, organization_id: organizationId })
        .select()
        .single()
      
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      preferences = newPrefs
    } else if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ preferences })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Atualizar preferências
export async function PUT(request: NextRequest) {
  try {
    // Derive identity from the SESSION — drop any client-supplied ids.
    const auth = await getAuthClient()
    if (!auth) return authError()

    const organization_id = auth.user.organization_id
    const user_id = auth.user.id

    const body = await request.json()
    const { organization_id: _ignoredOrg, user_id: _ignoredUser, ...updates } = body

    const allowedFields = [
      'mention_enabled', 'task_assigned_enabled', 'task_due_soon_enabled',
      'task_overdue_enabled', 'task_completed_enabled', 'comment_reply_enabled',
      'deal_assigned_enabled', 'deal_stage_changed_enabled', 'whatsapp_mention_enabled',
      'reminder_enabled', 'in_app_enabled', 'email_enabled', 'push_enabled',
      'dnd_enabled', 'dnd_start', 'dnd_end'
    ]
    
    const sanitizedUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (field in updates) sanitizedUpdates[field] = updates[field]
    }
    
    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id, organization_id, ...sanitizedUpdates }, { onConflict: 'user_id,organization_id' })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ preferences })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
