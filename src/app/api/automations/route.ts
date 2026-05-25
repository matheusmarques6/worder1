import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError, validateStoreAccess } from '@/lib/api-utils';
import { validateFlow } from '@/lib/automation/flow-validation';
import { SupabaseClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// GET - List automations or get single automation
export async function GET(request: NextRequest) {
  // ✅ SEGURANÇA: Auth obrigatório
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  // ✅ SEGURANÇA: Rejeitar se tentar acessar outra org
  const searchParams = request.nextUrl.searchParams;
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ✅ NOVO: Filtro por loja
  const storeId = searchParams.get('storeId');

  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const automationId = searchParams.get('id');

  try {
    if (automationId) {
      // Busca por ID específico - não precisa de storeId
      const { data, error } = await supabase
        .from('automations')
        .select(`
          *,
          automation_runs(
            id,
            status,
            started_at,
            completed_at,
            metadata
          )
        `)
        .eq('id', automationId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return NextResponse.json({ automation: data });
    }

    // ✅ MODIFICADO: Para listagem, validar e usar storeId
    // Validar acesso à loja se storeId fornecido
    if (storeId) {
      const storeValidation = await validateStoreAccess(auth.supabase, organizationId, storeId);
      if (!storeValidation.valid) {
        return NextResponse.json(
          { error: storeValidation.error },
          { status: storeValidation.status || 400 }
        );
      }
    }

    let query = supabase
      .from('automations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    // Filtrar estritamente por loja — automações sem store_id (legacy) ficam ocultas
    // até que sejam atribuídas a uma loja específica via PATCH.
    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching automations:', error);
      // ✅ CORREÇÃO: Retornar erro real em vez de array vazio
      return NextResponse.json({ error: error.message, automations: [] }, { status: 500 });
    }
    return NextResponse.json({ automations: data || [] });
  } catch (error: any) {
    console.error('Automation GET error:', error);
    // ✅ CORREÇÃO: Retornar erro real
    return NextResponse.json({ error: error.message, automations: [] }, { status: 500 });
  }
}

// POST - Create automation or trigger run
export async function POST(request: NextRequest) {
  // ✅ SEGURANÇA: Auth obrigatório
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    // Ignorar organizationId do body - usar do auth
    const { action, organizationId: _ignore, ...data } = body;

    if (action === 'run') {
      return await runAutomation(organizationId, data);
    }

    // ✅ NOVO: Validar store_id se fornecido
    if (data.store_id) {
      const storeValidation = await validateStoreAccess(auth.supabase, organizationId, data.store_id);
      if (!storeValidation.valid) {
        return NextResponse.json(
          { error: storeValidation.error },
          { status: storeValidation.status || 400 }
        );
      }
    }

    // ✅ CORREÇÃO: Salvar nodes, edges e status corretamente
    const insertData: Record<string, any> = {
      organization_id: organizationId,
      store_id: data.store_id || null, // ✅ NOVO: Salvar store_id
      name: data.name || 'Nova Automação',
      description: data.description || null,
      trigger_type: data.trigger_type || 'manual',
      trigger_config: data.trigger_config || {},
      trigger_filters: data.trigger_filters || [],
      audience_filters: data.audience_filters || [],
      exit_conditions: data.exit_conditions || [],
      frequency_config: data.frequency_config || { type: 'once' },
      nodes: data.nodes || [],
      edges: data.edges || [],
      status: data.status || 'draft',
      created_by: auth.user.id,
    };

    // Se status for 'active', validar e setar activated_at
    if (data.status === 'active') {
      const validation = validateFlow(insertData.nodes || [], insertData.edges || [])
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: 'Automação inválida. Corrija os problemas antes de ativar.',
            issues: validation.issues,
          },
          { status: 422 }
        )
      }
      insertData.activated_at = new Date().toISOString();
    }

    const { data: automation, error } = await supabase
      .from('automations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating automation:', error);
      throw error;
    }
    
    return NextResponse.json({ automation }, { status: 201 });
  } catch (error: any) {
    console.error('Automation POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update automation
export async function PUT(request: NextRequest) {
  // ✅ SEGURANÇA: Auth obrigatório
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { id, organizationId: _ignore, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Automation ID required' }, { status: 400 });
    }

    // ✅ CORREÇÃO: Preparar dados de atualização corretamente
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Backfill store_id on legacy automations (null → current store)
    if (data.store_id) {
      const { data: existing } = await auth.supabase
        .from('automations')
        .select('store_id')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();
      if (existing && !existing.store_id) {
        updateData.store_id = data.store_id;
      }
    }

    // Campos permitidos para atualização
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
    if (data.trigger_config !== undefined) updateData.trigger_config = data.trigger_config;
    if (data.trigger_filters !== undefined) updateData.trigger_filters = data.trigger_filters;
    if (data.audience_filters !== undefined) updateData.audience_filters = data.audience_filters;
    if (data.exit_conditions !== undefined) updateData.exit_conditions = data.exit_conditions;
    if (data.frequency_config !== undefined) updateData.frequency_config = data.frequency_config;
    if (data.nodes !== undefined) updateData.nodes = data.nodes;
    if (data.edges !== undefined) updateData.edges = data.edges;
    
    // ✅ Tratar mudanças de status
    if (data.status !== undefined) {
      updateData.status = data.status;

      // Setar timestamps baseado no status
      if (data.status === 'active') {
        // ✅ VALIDAÇÃO OBRIGATÓRIA ao ativar: sem loops, sem branches órfãs, delays válidos
        // Pega nodes/edges do payload OU do estado atual no banco
        let nodes = data.nodes
        let edges = data.edges
        if (!nodes || !edges) {
          const { data: current } = await supabase
            .from('automations')
            .select('nodes, edges')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .single()
          nodes = nodes || current?.nodes || []
          edges = edges || current?.edges || []
        }
        const validation = validateFlow(nodes, edges)
        if (!validation.valid) {
          return NextResponse.json(
            {
              error: 'Automação inválida. Corrija os problemas antes de ativar.',
              issues: validation.issues,
            },
            { status: 422 }
          )
        }

        updateData.activated_at = new Date().toISOString();
        updateData.paused_at = null;
      } else if (data.status === 'paused') {
        updateData.paused_at = new Date().toISOString();
      }
    }

    const { data: automation, error } = await supabase
      .from('automations')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating automation:', error);
      throw error;
    }
    
    return NextResponse.json({ automation });
  } catch (error: any) {
    console.error('Automation PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete automation
export async function DELETE(request: NextRequest) {
  // ✅ SEGURANÇA: Auth obrigatório
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Automation ID required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Automation DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper function to run automation
async function runAutomation(organizationId: string, data: any) {
  const { automationId, contactId, contactIds } = data;

  if (!automationId) {
    return NextResponse.json({ error: 'Automation ID required' }, { status: 400 });
  }

  // Get automation
  const { data: automation, error: automationError } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .eq('organization_id', organizationId)
    .single();

  if (automationError || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }

  // Create run record
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .insert({
      automation_id: automationId,
      status: 'pending',
      metadata: {
        contact_id: contactId,
        contact_ids: contactIds,
        triggered_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  return NextResponse.json({ run, message: 'Automation queued' });
}
