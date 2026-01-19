// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roleFilter = searchParams.get('role') // "agent,admin,owner"
    
    // Tentar pegar organization_id do usuário autenticado
    let organizationId = searchParams.get('organization_id')
    
    if (!organizationId) {
      try {
        const supabaseClient = createRouteHandlerClient({ cookies })
        const { data: { user } } = await supabaseClient.auth.getUser()
        
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single()
          
          organizationId = profile?.organization_id
        }
      } catch (e) {
        // Continuar sem organização
      }
    }

    // Construir query
    let query = supabase
      .from('profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        full_name,
        avatar_url,
        role,
        organization_id
      `)
      .order('full_name', { ascending: true })

    // Filtrar por organização
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    // Filtrar por roles
    if (roleFilter) {
      const roles = roleFilter.split(',').map(r => r.trim())
      query = query.in('role', roles)
    }

    const { data: profiles, error } = await query

    if (error) {
      console.error('Error fetching users:', error)
      throw error
    }

    // Formatar para o frontend
    const users = (profiles || []).map(profile => ({
      id: profile.id,
      name: profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
      email: profile.email,
      avatar_url: profile.avatar_url,
      role: profile.role,
      organization_id: profile.organization_id,
    }))

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error('Error in users API:', error)
    return NextResponse.json({ error: error.message, users: [] }, { status: 500 })
  }
}
