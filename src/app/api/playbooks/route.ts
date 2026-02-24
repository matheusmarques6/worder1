import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic';

// =============================================
// API: /api/playbooks
// CRUD de playbooks de automação
// =============================================

// GET - Listar playbooks
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organization_id = searchParams.get('organization_id')
    const playbook_id = searchParams.get('id')
    const include_templates = searchParams.get('templates') === 'true'
    const category = searchParams.get('category')

    // Buscar playbook específico
    if (playbook_id) {
      const { data, error } = await supabase
        .from('automation_playbooks')
        .select('*')
        .eq('id', playbook_id)
        .single()

      if (error) throw error

      // Buscar métricas de runs
      const { data: stats } = await supabase
        .from('playbook_runs')
        .select('status, converted, conversion_revenue')
        .eq('playbook_id', playbook_id)

      const metrics = {
        total_runs: stats?.length || 0,
        completed: stats?.filter(r => r.status === 'completed').length || 0,
        converted: stats?.filter(r => r.converted).length || 0,
        total_revenue: stats?.reduce((sum, r) => sum + (r.conversion_revenue || 0), 0) || 0,
      }

      return NextResponse.json({ playbook: { ...data, metrics } })
    }

    // Listar playbooks da organização
    if (organization_id) {
      let query = supabase
        .from('automation_playbooks')
        .select('*')
        .or(`organization_id.eq.${organization_id},is_template.eq.true`)
        .order('is_template', { ascending: false })
        .order('created_at', { ascending: false })

      if (category) query = query.eq('category', category)

      const { data: playbooks, error } = await query
      if (error) throw error

      return NextResponse.json({ playbooks })
    }

    // Listar apenas templates globais
    if (include_templates) {
      const { data: templates, error } = await supabase
        .from('automation_playbooks')
        .select('*')
        .eq('is_template', true)
        .order('category')

      if (error) throw error
      return NextResponse.json({ templates })
    }

    return NextResponse.json({ error: 'organization_id or templates=true required' }, { status: 400 })

  } catch (error: any) {
    console.error('[Playbooks] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar playbook (ou clonar template)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      organization_id,
      template_id, // Se clonar de template
      name,
      description,
      category,
      trigger_type,
      trigger_config = {},
      steps = [],
      settings = {},
    } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
    }

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
          is_active: false, // Começa desativado
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
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Não permitir editar templates
    const { data: existing } = await supabase
      .from('automation_playbooks')
      .select('is_template')
      .eq('id', id)
      .single()

    if (existing?.is_template) {
      return NextResponse.json({ error: 'Cannot edit templates' }, { status: 403 })
    }

    const { data: playbook, error } = await supabase
      .from('automation_playbooks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
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
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Não permitir deletar templates
    const { data: existing } = await supabase
      .from('automation_playbooks')
      .select('is_template')
      .eq('id', id)
      .single()

    if (existing?.is_template) {
      return NextResponse.json({ error: 'Cannot delete templates' }, { status: 403 })
    }

    // Cancelar runs em andamento
    await supabase
      .from('playbook_runs')
      .update({ status: 'cancelled' })
      .eq('playbook_id', id)
      .eq('status', 'running')

    const { error } = await supabase
      .from('automation_playbooks')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[Playbooks] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
