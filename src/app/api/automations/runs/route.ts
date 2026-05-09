// =============================================
// WORDER: API de Execuções de Automações
// /src/app/api/automations/runs/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// =============================================
// GET - Listar execuções
// =============================================
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const searchParams = request.nextUrl.searchParams;
    
    const automationId = searchParams.get('automationId');
    const runId = searchParams.get('runId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const contactId = searchParams.get('contactId');
    const triggerType = searchParams.get('triggerType');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 100);
    const includeSteps = searchParams.get('includeSteps') === 'true';
    
    // Se pediu um run específico
    if (runId) {
      return getRunDetail(supabase, runId, includeSteps);
    }
    
    // Listar runs - RLS filtra automaticamente
    let query = supabase
      .from('automation_runs')
      .select(`
        *,
        automations(name, trigger_type, nodes),
        contacts(id, email, first_name, last_name)
      `, { count: 'exact' })
      .order('started_at', { ascending: false });
    
    if (automationId) {
      query = query.eq('automation_id', automationId);
    }
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (startDate) {
      query = query.gte('started_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('started_at', endDate);
    }
    
    if (contactId) {
      query = query.eq('contact_id', contactId);
    }
    
    if (triggerType) {
      query = query.eq('trigger_type', triggerType);
    }
    
    // Paginação
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    
    const { data: runs, error, count } = await query;
    
    if (error) {
      console.error('Erro ao buscar runs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Resolve a friendly label for the node where each run is currently
    // sitting (or where it failed) so the History panel can render
    // "Travado em: Aguardar 6 horas" instead of just an opaque status.
    const labelForNode = (nodes: any[] | undefined, nodeId: string | null | undefined): string | undefined => {
      if (!nodeId || !Array.isArray(nodes)) return undefined;
      const n = nodes.find((x: any) => x?.id === nodeId);
      if (!n) return undefined;
      return n.data?.label || n.data?.config?.emailName || n.data?.config?.subject || n.type || nodeId;
    };

    // Pull the trigger payload email for each run (used as fallback
    // contact label when automation_runs.contact_id is null but the
    // payload had an email — common when the dispatch happened before
    // the contacts upsert finished). Also try a real contacts lookup so
    // we can backfill contact_id and display name+email.
    const orphanRuns = (runs || []).filter((r: any) => !r.contacts);
    const orphanEmails: string[] = [];
    // Track checkout/cart tokens for runs that came in without email so
    // we can do a second-pass lookup against shopify_checkouts (which
    // gets refreshed on every checkouts/update with the latest email).
    const orphanTokens: string[] = [];
    for (const r of orphanRuns) {
      const td: any = r.metadata?.trigger_data || {};
      const props: any = td.properties || td;
      const email = (
        td.CustomerEmail || td.email || td.Email ||
        props.CustomerEmail || props.email || props.Email ||
        props?.Customer?.Email || props?.raw?.email ||
        props?.raw?.customer?.email || props?.raw?.billing_address?.email ||
        ''
      ).toString().trim().toLowerCase();
      (r as any)._payloadEmail = email || null;
      if (email) orphanEmails.push(email);
      const token = td.checkout_token || td.cart_token || td.CheckoutId || props.checkout_token || props.cart_token;
      if (token && !email) {
        (r as any)._token = String(token);
        orphanTokens.push(String(token));
      }
    }

    // Second pass: for runs still without email, look the checkout up
    // in shopify_checkouts. That table is refreshed by every
    // checkouts/update with the latest email even if the original
    // checkouts/create came in anonymous.
    if (orphanTokens.length > 0) {
      const uniqTokens = Array.from(new Set(orphanTokens));
      const { data: checkouts } = await supabase
        .from('shopify_checkouts')
        .select('checkout_token, cart_token, shopify_checkout_id, email, contact_id')
        .or(uniqTokens.map(t => `checkout_token.eq.${t},cart_token.eq.${t},shopify_checkout_id.eq.${t}`).join(','));
      const tokenMap = new Map<string, any>();
      for (const c of checkouts || []) {
        if (c.checkout_token) tokenMap.set(String(c.checkout_token), c);
        if (c.cart_token) tokenMap.set(String(c.cart_token), c);
        if (c.shopify_checkout_id) tokenMap.set(String(c.shopify_checkout_id), c);
      }
      for (const r of orphanRuns) {
        if ((r as any)._payloadEmail) continue;
        const tok = (r as any)._token;
        const c = tok ? tokenMap.get(tok) : null;
        if (c?.email) {
          const e = String(c.email).trim().toLowerCase();
          (r as any)._payloadEmail = e;
          orphanEmails.push(e);
        }
        if (c?.contact_id && !r.contact_id) {
          // Backfill so future renders are O(1).
          supabase.from('automation_runs').update({ contact_id: c.contact_id }).eq('id', r.id).then(() => {}, () => {});
        }
      }
    }

    let payloadContactByEmail = new Map<string, any>();
    if (orphanEmails.length > 0) {
      const uniq = Array.from(new Set(orphanEmails));
      const { data: matched } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name')
        .in('email', uniq);
      payloadContactByEmail = new Map(
        (matched || []).map((c: any) => [String(c.email).toLowerCase(), c])
      );
      // Backfill automation_runs.contact_id so the next render is O(1).
      const updates: { id: string; contact_id: string }[] = [];
      for (const r of orphanRuns) {
        const email = (r as any)._payloadEmail;
        if (!email) continue;
        const c = payloadContactByEmail.get(email);
        if (c?.id) updates.push({ id: r.id, contact_id: c.id });
      }
      // Fire-and-forget; we don't block the response on this.
      for (const u of updates) {
        supabase.from('automation_runs').update({ contact_id: u.contact_id }).eq('id', u.id).then(() => {}, () => {});
      }
    }

    // Formatar resposta
    const formattedRuns = runs?.map((run: any) => {
      // Build the contact object with three layers of fallback:
      // 1) joined contacts row (run.contacts) — happy path
      // 2) contact resolved by trigger payload email (just looked up)
      // 3) bare email from the trigger payload — at least show that
      const payloadEmail = (run as any)._payloadEmail as string | null;
      const matched = payloadEmail ? payloadContactByEmail.get(payloadEmail) : null;
      let contact: { id: string | null; email: string; name: string } | null = null;
      if (run.contacts) {
        contact = {
          id: run.contacts.id,
          email: run.contacts.email,
          name: `${run.contacts.first_name || ''} ${run.contacts.last_name || ''}`.trim() || run.contacts.email,
        };
      } else if (matched) {
        contact = {
          id: matched.id,
          email: matched.email,
          name: `${matched.first_name || ''} ${matched.last_name || ''}`.trim() || matched.email,
        };
      } else if (payloadEmail) {
        contact = { id: null, email: payloadEmail, name: payloadEmail };
      }

      return {
        id: run.id,
        automation_id: run.automation_id,
        automation_name: run.automations?.name,
        status: run.status,
        trigger_type:
          run.trigger_type ||
          run.metadata?.trigger_type ||
          run.automations?.trigger_type ||
          null,
        contact,
        deal_id: run.deal_id,
        total_steps: run.total_steps,
        completed_steps: run.completed_steps,
        failed_steps: run.failed_steps,
        duration_ms: run.duration_ms,
        current_node_id: run.current_node_id || run.error_node_id,
        current_node_label: labelForNode(run.automations?.nodes, run.current_node_id || run.error_node_id),
        waiting_until: run.waiting_until,
        error_message: run.error_message,
        error_node_id: run.error_node_id,
        started_at: run.started_at,
        completed_at: run.completed_at,
      };
    });
    
    return NextResponse.json({
      runs: formattedRuns,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize)
      }
    });
    
  } catch (error: any) {
    console.error('Erro na API de runs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// Detalhe de uma execução
// =============================================
async function getRunDetail(
  supabase: any, 
  runId: string,
  includeSteps: boolean
) {
  // Buscar run - RLS filtra automaticamente
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .select(`
      *,
      automations(name, trigger_type),
      contacts(id, email, first_name, last_name, phone)
    `)
    .eq('id', runId)
    .single();
  
  if (runError || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  
  let steps = [];
  
  if (includeSteps) {
    const { data: stepsData } = await supabase
      .from('automation_run_steps')
      .select('*')
      .eq('run_id', runId)
      .order('step_order', { ascending: true });
    
    steps = stepsData?.map((step: any) => ({
      id: step.id,
      node_id: step.node_id,
      node_type: step.node_type,
      node_label: step.node_label,
      step_order: step.step_order,
      status: step.status,
      input_data: step.input_data,
      output_data: step.output_data,
      config_used: step.config_used,
      variables_resolved: step.variables_resolved,
      error_message: step.error_message,
      error_details: step.error_details,
      duration_ms: step.duration_ms,
      started_at: step.started_at,
      completed_at: step.completed_at
    })) || [];
  }
  
  return NextResponse.json({
    run: {
      id: run.id,
      automation_id: run.automation_id,
      automation_name: run.automations?.name,
      status: run.status,
      trigger_type:
        run.trigger_type ||
        run.metadata?.trigger_type ||
        run.automations?.trigger_type ||
        null,
      trigger_data: run.trigger_data,
      contact: run.contacts ? {
        id: run.contacts.id,
        email: run.contacts.email,
        name: `${run.contacts.first_name || ''} ${run.contacts.last_name || ''}`.trim() || run.contacts.email,
        phone: run.contacts.phone
      } : null,
      deal_id: run.deal_id,
      total_steps: run.total_steps,
      completed_steps: run.completed_steps,
      failed_steps: run.failed_steps,
      error: run.error_message ? {
        node_id: run.error_node_id,
        message: run.error_message
      } : null,
      context: run.context,
      duration_ms: run.duration_ms,
      started_at: run.started_at,
      completed_at: run.completed_at
    },
    steps
  });
}

// =============================================
// POST - Reexecutar ou testar automação
// =============================================
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const body = await request.json();
    
    const { action, automationId, runId, testData } = body;
    
    // Ação: reexecutar um run anterior
    if (action === 'rerun' && runId) {
      return rerunExecution(supabase, runId);
    }
    
    // Ação: testar automação com dados de exemplo
    if (action === 'test' && automationId) {
      return testAutomation(supabase, automationId, testData);
    }

    // Ação: cancelar runs em estado intermediário (waiting/pending/running)
    // Permite ao merchant limpar a fila para retestar do zero quando o
    // flow está num estado inconsistente. Só cancela do automationId
    // informado (RLS já isola por organização).
    if (action === 'cancel_active' && automationId) {
      const { data, error: cancelErr, count } = await supabase
        .from('automation_runs')
        .update({
          status: 'cancelled',
          waiting_until: null,
          completed_at: new Date().toISOString(),
          last_error: 'Cancelado manualmente',
        }, { count: 'exact' })
        .in('status', ['waiting', 'pending', 'running'])
        .eq('automation_id', automationId)
        .select('id');
      if (cancelErr) {
        return NextResponse.json({ error: cancelErr.message }, { status: 500 });
      }
      return NextResponse.json({
        message: 'Runs cancelados',
        cancelled: data?.length ?? count ?? 0,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error: any) {
    console.error('Erro no POST de runs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// Reexecutar uma execução anterior
// =============================================
async function rerunExecution(supabase: any, runId: string) {
  // Buscar run original - RLS filtra automaticamente
  const { data: originalRun, error } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('id', runId)
    .single();
  
  if (error || !originalRun) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  
  // Buscar automação - RLS filtra automaticamente
  const { data: automation } = await supabase
    .from('automations')
    .select('*')
    .eq('id', originalRun.automation_id)
    .single();
  
  if (!automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }
  
  return NextResponse.json({
    message: 'Reexecução enfileirada',
    original_run_id: runId,
    automation_id: automation.id,
  });
}

// =============================================
// Testar automação com dados de exemplo
// =============================================
async function testAutomation(
  supabase: any, 
  automationId: string,
  testData?: any
) {
  // Buscar automação - RLS filtra automaticamente
  const { data: automation, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .single();
  
  if (error || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }
  
  // Buscar um contato de exemplo se não fornecido - RLS filtra automaticamente
  let contactId = testData?.contact_id;
  if (!contactId) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id')
      .limit(1);
    
    contactId = contacts?.[0]?.id;
  }
  
  return NextResponse.json({
    message: 'Teste enfileirado',
    automation_id: automationId,
    test_contact_id: contactId,
    test_data: testData
  });
}

// =============================================
// DELETE - Limpar execuções antigas
// =============================================
export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const searchParams = request.nextUrl.searchParams;
    
    const automationId = searchParams.get('automationId');
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30', 10);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    // RLS filtra automaticamente
    let query = supabase
      .from('automation_runs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());
    
    if (automationId) {
      query = query.eq('automation_id', automationId);
    }
    
    const { error, count } = await query;
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      message: 'Execuções removidas',
      deleted_count: count || 0,
      older_than: cutoffDate.toISOString()
    });
    
  } catch (error: any) {
    console.error('Erro ao deletar runs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
