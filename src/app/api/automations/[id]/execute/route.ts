import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, getSupabaseClient } from '@/lib/api-utils';
import { orgStoreIds } from '@/lib/api/guards';
import { ExecutionEngine } from '@/lib/automation/execution-engine';
import { decryptCredential } from '@/lib/automation/credential-encryption';
export const dynamic = 'force-dynamic';

// ============================================
// POST - Executar automação
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;
  const organizationId = auth.user.organization_id;

  try {
    const { id: automationId } = await params;
    const body = await request.json();

    const {
      contactId,
      dealId,
      triggerType,
      triggerData = {},
      isTest = false,
    } = body;

    // O filtro por organização é explícito, não herdado. O comentário
    // antigo dizia que a RLS filtrava sozinha, e a RLS está desligada
    // nestas tabelas: sem o `.eq`, o id de uma automação de outra
    // organização era suficiente para executá-la.
    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('organization_id', organizationId)
      .single();

    if (automationError || !automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    // Verificar se está ativa (exceto para testes)
    if (!isTest && automation.status !== 'active') {
      return NextResponse.json({ error: 'Automação não está ativa' }, { status: 400 });
    }

    const nodes = automation.nodes || [];
    const edges = automation.edges || [];

    if (nodes.length === 0) {
      return NextResponse.json({ error: 'Automação não possui nós' }, { status: 400 });
    }

    // Buscar contato se fornecido
    let contact: Record<string, any> | null = null;
    if (contactId) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('organization_id', organizationId)
        .single();

      contact = contactData;
    }

    // Buscar deal se fornecido. `deals` não tem coluna de organização:
    // a cerca é a loja.
    let deal: Record<string, any> | null = null;
    if (dealId) {
      const storeIds = await orgStoreIds(supabase, organizationId);
      if (storeIds.length > 0) {
        const { data: dealData } = await supabase
          .from('deals')
          .select('*')
          .eq('id', dealId)
          .in('store_id', storeIds)
          .single();

        deal = dealData;
      }
    }

    // Buscar credenciais necessárias para os nós
    const credentialsNeeded = new Set<string>();
    for (const node of nodes) {
      const credentialId = node.data?.config?.credentialId;
      if (credentialId) {
        credentialsNeeded.add(credentialId);
      }
    }

    const credentials: Record<string, any> = {};
    if (credentialsNeeded.size > 0) {
      // Sem o filtro de organização aqui, bastava apontar um nó da
      // própria automação para o id de uma credencial alheia: a rota
      // decriptava e usava. É o vazamento mais caro desta rota.
      const { data: credentialRecords } = await supabase
        .from('credentials')
        .select('id, type, encrypted_data')
        .eq('organization_id', organizationId)
        .in('id', Array.from(credentialsNeeded));

      for (const cred of credentialRecords || []) {
        try {
          const decrypted = decryptCredential(cred.encrypted_data);
          credentials[cred.id] = {
            ...decrypted,
            type: cred.type,
          };
        } catch (err) {
          console.error(`Erro ao decriptar credencial ${cred.id}:`, err);
        }
      }
    }

    // Criar contexto de execução
    const startTime = Date.now();
    const executionId = `${isTest ? 'TEST' : 'EXEC'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Criar engine de execução
    const supabaseAdmin = getSupabaseClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database não configurado' }, { status: 500 });
    }

    const engine = new ExecutionEngine({
      supabase: supabaseAdmin,
      isTest,
    });

    // Preparar workflow
    const workflow = {
      id: automationId,
      nodes,
      edges,
      settings: automation.settings || {},
    };

    // Preparar contexto inicial
    const initialContext = {
      trigger: {
        type: triggerType || 'manual',
        data: triggerData,
        timestamp: new Date().toISOString(),
      },
      contact: contact || {
        id: 'sample-contact',
        email: 'teste@exemplo.com',
        phone: '+5511999999999',
        name: 'Contato Teste',
        firstName: 'Contato',
        lastName: 'Teste',
        tags: [],
        customFields: {},
        createdAt: new Date().toISOString(),
      },
      deal: deal || undefined,
      nodes: {},
      workflow: {
        id: automationId,
        name: automation.name,
        executionId,
      },
      now: {
        iso: new Date().toISOString(),
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        dayOfWeek: new Date().getDay(),
        dayOfMonth: new Date().getDate(),
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      },
      env: {
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
      },
    };

    // Executar workflow
    const result = await engine.execute(workflow, {
      context: initialContext as any,
      credentials,
      executionId,
    });

    const duration = Date.now() - startTime;

    // Salvar execução no banco (exceto para testes)
    if (!isTest) {
      try {
        await supabaseAdmin
          .from('automation_executions')
          .insert({
            id: executionId,
            automation_id: automationId,
            status: result.status,
            trigger_type: triggerType || 'manual',
            trigger_data: triggerData,
            contact_id: contactId || null,
            deal_id: dealId || null,
            node_results: result.nodeResults,
            final_context: result.context,
            duration_ms: duration,
            error_message: result.error || null,
            error_node_id: result.errorNodeId || null,
            started_at: initialContext.trigger.timestamp,
            completed_at: new Date().toISOString(),
          });
      } catch (saveError) {
        console.error('Erro ao salvar execução:', saveError);
      }
    }

    // Formatar resposta
    const response = {
      success: result.status === 'success',
      executionId,
      status: result.status,
      duration: duration,
      totalDuration: duration,
      contact: initialContext.contact,
      trigger: initialContext.trigger,
      steps: Object.entries(result.nodeResults || {}).map(([nodeId, nodeResult]: [string, any]) => ({
        nodeId,
        status: nodeResult.status,
        output: nodeResult.output,
        error: nodeResult.error,
        duration: nodeResult.duration,
      })),
      nodeResults: result.nodeResults,
      error: result.error,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Erro ao executar automação:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      steps: [],
    }, { status: 500 });
  }
}
