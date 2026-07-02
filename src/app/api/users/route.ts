// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Require a session — org is derived from the caller, never the query.
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { searchParams } = new URL(request.url)
    const roleFilter = searchParams.get('role') // "agent,admin,owner"

    const organizationId = auth.user.organization_id

    // Construir query — sempre escopada à org do chamador.
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
      .eq('organization_id', organizationId)
      .order('full_name', { ascending: true })

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
