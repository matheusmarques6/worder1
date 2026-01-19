import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// GET - Buscar usuários para menção
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const query = searchParams.get('q') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)
    
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }
    
    const { data: members, error } = await supabase
      .from('organization_members')
      .select('user_id, role, users:user_id(id, name, email, avatar_url)')
      .eq('organization_id', organizationId)
      .limit(limit)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    let users = members?.map(m => ({
      id: (m.users as any)?.id,
      name: (m.users as any)?.name,
      email: (m.users as any)?.email,
      avatar_url: (m.users as any)?.avatar_url,
      role: m.role
    })).filter(u => u.id) || []
    
    if (query.trim()) {
      const lowerQuery = query.toLowerCase()
      users = users.filter(u => 
        (u.name?.toLowerCase().includes(lowerQuery)) ||
        (u.email?.toLowerCase().includes(lowerQuery))
      )
    }
    
    return NextResponse.json({ users, count: users.length })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
