// =============================================
// WORDER: Test automation — REAL execution with isTest=true
// /src/app/api/automations/[id]/test
//
// Executa o ExecutionEngine real com test=true.
// Actions side-effecting retornam { simulated: true } sem efeito.
// Condicionais, A/B split, delays, variáveis, validação — todos reais.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { executeWorkflow, Workflow } from '@/lib/automation/execution-engine'
import { validateFlow } from '@/lib/automation/flow-validation'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: automationId } = await params
  const auth = await getAuthClient()
  if (!auth) return authError()

  try {
    const body = await req.json()
    const { contactId, useSampleData = false, triggerData = {} } = body
    const orgId = auth.user.organization_id

    const { data: automation, error } = await supabaseAdmin
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('organization_id', orgId)
      .single()

    if (error || !automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 })
    }

    const nodes = automation.nodes || []
    const edges = automation.edges || []

    if (nodes.length === 0) {
      return NextResponse.json({ error: 'Automação vazia' }, { status: 400 })
    }

    // 1. Roda validação
    const validation = validateFlow(nodes, edges)

    // 2. Busca contact real ou cria sample
    let contact: any = null
    if (contactId && !useSampleData) {
      const { data: c } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('organization_id', orgId)
        .maybeSingle()
      contact = c
    }
    if (!contact) {
      contact = {
        id: 'sample-contact-id',
        email: 'cliente.teste@exemplo.com',
        phone: '+5511999999999',
        first_name: 'João',
        last_name: 'Silva',
        full_name: 'João Silva',
        total_orders: 5,
        total_spent: 1500.0,
        tags: ['cliente', 'vip'],
        custom_fields: { preferencia: 'email', aniversario: '1990-05-15' },
        created_at: new Date().toISOString(),
      }
    }

    // 3. Executar no engine real com isTest=true
    const workflow: Workflow = {
      id: automation.id,
      name: automation.name,
      nodes,
      edges,
      settings: { ...automation.settings, errorHandling: 'continue' },
    }

    const started = Date.now()
    const result = await executeWorkflow(workflow, {
      isTest: true,
      organizationId: orgId,
      contactId: contact.id,
      triggerData,
      context: {
        contact: {
          id: contact.id,
          email: contact.email,
          phone: contact.phone,
          firstName: contact.first_name,
          lastName: contact.last_name,
          name: contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' '),
          tags: contact.tags || [],
          customFields: contact.custom_fields || {},
          createdAt: contact.created_at,
          updatedAt: contact.updated_at,
        },
        trigger: {
          data: triggerData,
          type: automation.trigger_type || 'manual',
        },
      } as any,
    })
    const totalDuration = Date.now() - started

    // 4. Formatar steps para UI
    const steps = Object.entries(result.nodeResults || {}).map(([nodeId, r]: [string, any]) => ({
      nodeId,
      status: r.status,
      output: r.output,
      error: r.error,
      duration: r.duration || 0,
      branch: r.branch,
    }))

    return NextResponse.json({
      success: result.status === 'success',
      status: result.status,
      executionId: result.executionId,
      contact,
      trigger: { data: triggerData },
      steps,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
      totalDuration,
      error: result.error,
    })
  } catch (err: any) {
    console.error('[test] error:', err)
    return NextResponse.json(
      { success: false, error: err?.message, steps: [] },
      { status: 500 }
    )
  }
}
