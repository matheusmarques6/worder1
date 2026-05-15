// =============================================
// API: /api/playbooks
// CRUD de playbooks de automação
//
// Tenant rules:
//  - Every method requires getAuthClient(). No method trusts
//    organization_id from the request body / query string — the
//    user's orgs come from auth + organization_members.
//  - Templates (is_template=true) are global and readable by any
//    authenticated user; PATCH/DELETE refuse to touch them.
//  - PATCH/DELETE always scope by organization_id IN [user orgs]
//    so leaking an id can't grant cross-org write access.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic';

async function getUserOrgIds(userId: string, primaryOrgId: string): Promise<string[]> {
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
  const ids = new Set<string>([primaryOrgId])
  for (const m of memberships || []) {
    if (m.organization_id) ids.add(m.organization_id)
  }
  return Array.from(ids)
}

// GET - Listar playbooks
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgIds = await getUserOrgIds(auth.user.id, auth.user.organization_id)

    const { searchParams } = new URL(request.url)
    const playbook_id = searchParams.get('id')
    const include_templates = searchParams.get('templates') === 'true'
    const category = searchParams.get('category')

    // Buscar playbook específico — must belong to user's org OR be a template
    if (playbook_id) {
      const { data, error } = await supabase
        .from('automation_playbooks')
        .select('*')
        .eq('id', playbook_id)
        .or(`organization_id.in.(${orgIds.join(',')}),is_template.eq.true`)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
      }

      const { data: stats } = await supabase
        .from('playbook_runs')
        .select('status, converted, conversion_revenue')
        .eq('playbook_id', playbook_id)
        .in('organization_id', orgIds)

      const metrics = {
        total_runs: stats?.length || 0,
        completed: stats?.filter(r => r.status === 'completed').length || 0,
        converted: stats?.filter(r => r.converted).length || 0,
        total_revenue: stats?.reduce((sum, r) => sum + (r.conversion_revenue || 0), 0) || 0,
      }

      return NextResponse.json({ playbook: { ...data, metrics } })
    }

    // Listar templates apenas
    if (include_templates) {
      const { data: templates, error } = await supabase
        .from('automation_playbooks')
        .select('*')
        .eq('is_template', true)
        .order('category')

      if (error) throw error
      return NextResponse.json({ templates })
    }

    // Listar playbooks da org do usuário (+ templates globais)
    let query = supabase
      .from('automation_playbooks')
      .select('*')
      .or(`organization_id.in.(${orgIds.join(',')}),is_template.eq.true`)
      .order('is_template', { ascending: false })
      .order('created_at', { ascending: false })

    if (category) query = query.eq('category', category)

    const { data: playbooks, error } = await query
    if (error) throw error

    return NextResponse.json({ playbooks })

  } catch (error: any) {
    console.error('[Playbooks] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar playbook (ou clonar template)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgIds = await getUserOrgIds(auth.user.id, auth.user.organization_id)

    const body = await request.json()
    const {
      organization_id: bodyOrgId,
      template_id,
      name,
      description,
      category,
      trigger_type,
      trigger_config = {},
      steps = [],
      settings = {},
    } = body

    // Honor an explicit org from the body iff the user belongs to it.
    // Default to the user's primary org otherwise. Body org is never
    // trusted blindly.
    const organization_id =
      bodyOrgId && orgIds.includes(bodyOrgId) ? bodyOrgId : auth.user.organization_id

    // Clonar de template
    if (template_id) {
      const { data: template, error: templateError } = await supabase
        .from('automation_playbooks')
        .select('*')
        .eq('id', template_id)
        .eq('is_template', true)
        .single()

      if (templateError || !template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      const { data: playbook, error } = await supabase
        .from('automation_playbooks')
        .insert({
          organization_id,
          name: name || template.name,
          description: description || template.description,
          category: template.category,
          is_template: false,
          is_active: false,
          trigger_type: template.trigger_type,
          trigger_config: { ...template.trigger_config, ...trigger_config },
          steps: template.steps,
          settings: { ...template.settings, ...settings },
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ playbook, cloned_from: template_id })
    }

    // Criar novo playbook
    if (!name || !category || !trigger_type) {
      return NextResponse.json({ error: 'name, category, and trigger_type required' }, { status: 400 })
    }

    const { data: playbook, error } = await supabase
      .from('automation_playbooks')
      .insert({
        organization_id,
        name,
        description,
        category,
        is_template: false,
        is_active: false,
        trigger_type,
        trigger_config,
        steps,
        settings,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ playbook })

  } catch (error: any) {
    console.error('[Playbooks] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Atualizar playbook
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgIds = await getUserOrgIds(auth.user.id, auth.user.organization_id)

    const body = await request.json()
    const { id, organization_id: _ignored, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Confirm the playbook belongs to a user-owned org AND is not a
    // template (templates are global, never edited).
    const { data: existing } = await supabase
      .from('automation_playbooks')
      .select('id, is_template, organization_id')
      .eq('id', id)
      .in('organization_id', orgIds)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
    }
    if (existing.is_template) {
      return NextResponse.json({ error: 'Cannot edit templates' }, { status: 403 })
    }

    // Strip organization_id from updates so a malicious client can't
    // move the playbook to another org.
    const { data: playbook, error } = await supabase
      .from('automation_playbooks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('organization_id', orgIds)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ playbook })

  } catch (error: any) {
    console.error('[Playbooks] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover playbook
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const orgIds = await getUserOrgIds(auth.user.id, auth.user.organization_id)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('automation_playbooks')
      .select('id, is_template, organization_id')
      .eq('id', id)
      .in('organization_id', orgIds)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
    }
    if (existing.is_template) {
      return NextResponse.json({ error: 'Cannot delete templates' }, { status: 403 })
    }

    // Cancelar runs em andamento (escopadas pela mesma org do playbook)
    await supabase
      .from('playbook_runs')
      .update({ status: 'cancelled' })
      .eq('playbook_id', id)
      .eq('status', 'running')
      .in('organization_id', orgIds)

    const { error } = await supabase
      .from('automation_playbooks')
      .delete()
      .eq('id', id)
      .in('organization_id', orgIds)

    if (error) throw error
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[Playbooks] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
