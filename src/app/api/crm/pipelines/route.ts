// src/app/api/crm/pipelines/route.ts
// Proxy para /api/pipelines
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Tentar pegar organization_id do usuário autenticado
    let organizationId = null
    
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
      console.error('Error getting user:', e)
    }

    // Buscar pipelines com stages
    let query = supabase
      .from('pipelines')
      .select(`
        id,
        name,
        color,
        description,
        is_active,
        is_default,
        stages:pipeline_stages(
          id,
          name,
          color,
          position,
          is_won,
          is_lost,
          probability
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    const { data: pipelines, error } = await query

    if (error) {
      console.error('Error fetching pipelines:', error)
      throw error
    }

    // Ordenar stages por position
    const formattedPipelines = (pipelines || []).map(pipeline => ({
      ...pipeline,
      stages: (pipeline.stages || []).sort((a: any, b: any) => a.position - b.position)
    }))

    return NextResponse.json({ pipelines: formattedPipelines })
  } catch (error: any) {
    console.error('Error in CRM pipelines API:', error)
    return NextResponse.json({ error: error.message, pipelines: [] }, { status: 500 })
  }
}
