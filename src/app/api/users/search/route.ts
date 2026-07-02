import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// GET - Buscar usuários para menção
export async function GET(request: NextRequest) {
  try {
    // Require a session — enumeration is scoped to the caller's orgs.
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)

    // Requested org is honored only if the caller belongs to it;
    // otherwise fall back to the caller's primary org. Never trust
    // an arbitrary client-supplied organization_id.
    const requestedOrg = searchParams.get('organization_id') || searchParams.get('org')
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([
      auth.user.organization_id,
      ...((memberships || []).map((m: any) => m.organization_id)),
    ])]
    const organizationId = requestedOrg && orgIds.includes(requestedOrg)
      ? requestedOrg
      : auth.user.organization_id

    // Tentar buscar de organization_members com join em profiles
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', organizationId)
      .limit(limit)
    
    if (membersError) {
      // Fallback: buscar direto de profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url, role')
        .eq('organization_id', organizationId)
        .limit(limit)
      
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError)
        return NextResponse.json({ error: profilesError.message, users: [] }, { status: 500 })
      }
      
      let users = (profiles || []).map(p => ({
        id: p.id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email?.split('@')[0] || 'Usuário',
        email: p.email,
        avatar_url: p.avatar_url,
        role: p.role || 'member'
      }))
      
      if (query.trim()) {
        const lowerQuery = query.toLowerCase()
        users = users.filter(u => 
          (u.name?.toLowerCase().includes(lowerQuery)) ||
          (u.email?.toLowerCase().includes(lowerQuery))
        )
      }
      
      return NextResponse.json({ users, count: users.length })
    }
    
    // Se tem members, buscar profiles correspondentes
    const userIds = members?.map(m => m.user_id).filter(Boolean) || []
    
    if (userIds.length === 0) {
      return NextResponse.json({ users: [], count: 0 })
    }
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, avatar_url, role')
      .in('id', userIds)
    
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      return NextResponse.json({ error: profilesError.message, users: [] }, { status: 500 })
    }
    
    // Mapear members com profiles
    const profilesMap = new Map((profiles || []).map(p => [p.id, p]))
    
    let users = members?.map(m => {
      const profile = profilesMap.get(m.user_id)
      return {
        id: m.user_id,
        name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email?.split('@')[0] : 'Usuário',
        email: profile?.email || '',
        avatar_url: profile?.avatar_url,
        role: m.role || profile?.role || 'member'
      }
    }).filter(u => u.id) || []
    
    if (query.trim()) {
      const lowerQuery = query.toLowerCase()
      users = users.filter(u => 
        (u.name?.toLowerCase().includes(lowerQuery)) ||
        (u.email?.toLowerCase().includes(lowerQuery))
      )
    }
    
    return NextResponse.json({ users, count: users.length })
  } catch (error: any) {
    console.error('Error in users search:', error)
    return NextResponse.json({ error: 'Internal server error', users: [] }, { status: 500 })
  }
}
