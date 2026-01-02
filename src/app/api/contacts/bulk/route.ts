// =============================================
// Bulk Contacts API
// src/app/api/contacts/bulk/route.ts
//
// Operações em massa para contatos:
// - delete: Excluir múltiplos contatos
// - addTags: Adicionar tags em massa
// - removeTags: Remover tags em massa
// - export: Exportar contatos selecionados
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// =============================================
// GET - Preview de exclusão (mostra o que será afetado)
// =============================================
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const contactIds = searchParams.get('contactIds')?.split(',').filter(Boolean);
  const filter = searchParams.get('filter'); // 'all', 'source:shopify', 'tag:teste', etc

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }

  try {
    let targetContactIds: string[] = [];

    // Se tem IDs específicos, usa eles
    if (contactIds && contactIds.length > 0) {
      targetContactIds = contactIds;
    } 
    // Se tem filtro, busca os IDs correspondentes
    else if (filter) {
      const ids = await getContactIdsByFilter(supabase, organizationId, filter);
      targetContactIds = ids;
    } else {
      return NextResponse.json({ error: 'contactIds or filter required' }, { status: 400 });
    }

    if (targetContactIds.length === 0) {
      return NextResponse.json({
        preview: {
          contactsCount: 0,
          dealsCount: 0,
          conversationsCount: 0,
          activitiesCount: 0,
        }
      });
    }

    // Contar deals associados
    const { count: dealsCount } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('contact_id', targetContactIds);

    // Contar conversas WhatsApp
    const { count: conversationsCount } = await supabase
      .from('whatsapp_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('contact_id', targetContactIds);

    // Contar atividades
    const { count: activitiesCount } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('contact_id', targetContactIds);

    return NextResponse.json({
      preview: {
        contactsCount: targetContactIds.length,
        dealsCount: dealsCount || 0,
        conversationsCount: conversationsCount || 0,
        activitiesCount: activitiesCount || 0,
        contactIds: targetContactIds.slice(0, 100), // Retorna primeiros 100 para preview
      }
    });

  } catch (error: any) {
    console.error('[Bulk Contacts API] Preview error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Executar operação em massa
// =============================================
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const {
      organizationId,
      action,
      contactIds,
      filter,
      options = {},
    } = body;

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: 'Action required' }, { status: 400 });
    }

    // Determinar quais contatos serão afetados
    let targetContactIds: string[] = [];

    if (contactIds && contactIds.length > 0) {
      targetContactIds = contactIds;
    } else if (filter) {
      targetContactIds = await getContactIdsByFilter(supabase, organizationId, filter);
    } else {
      return NextResponse.json({ error: 'contactIds or filter required' }, { status: 400 });
    }

    // Limite de segurança
    const MAX_BULK_OPERATIONS = 1000;
    if (targetContactIds.length > MAX_BULK_OPERATIONS) {
      return NextResponse.json({ 
        error: `Limite de ${MAX_BULK_OPERATIONS} contatos por operação. Você selecionou ${targetContactIds.length}.` 
      }, { status: 400 });
    }

    // Executar ação
    switch (action) {
      case 'delete':
        return await handleBulkDelete(supabase, organizationId, targetContactIds, options);
      
      case 'addTags':
        return await handleAddTags(supabase, organizationId, targetContactIds, options.tags);
      
      case 'removeTags':
        return await handleRemoveTags(supabase, organizationId, targetContactIds, options.tags);
      
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[Bulk Contacts API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// HELPERS
// =============================================

/**
 * Busca IDs de contatos por filtro
 */
async function getContactIdsByFilter(
  supabase: any,
  organizationId: string,
  filter: string
): Promise<string[]> {
  let query = supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId);

  // Parsear filtro
  if (filter.startsWith('source:')) {
    const source = filter.replace('source:', '');
    query = query.eq('source', source);
  } else if (filter.startsWith('tag:')) {
    const tag = filter.replace('tag:', '');
    query = query.contains('tags', [tag]);
  } else if (filter === 'no_orders') {
    query = query.or('total_orders.is.null,total_orders.eq.0');
  } else if (filter === 'no_email') {
    query = query.is('email', null);
  } else if (filter === 'no_phone') {
    query = query.is('phone', null);
  } else if (filter.startsWith('created_before:')) {
    const date = filter.replace('created_before:', '');
    query = query.lt('created_at', date);
  } else if (filter.startsWith('created_after:')) {
    const date = filter.replace('created_after:', '');
    query = query.gt('created_at', date);
  } else if (filter === 'duplicates_email') {
    // Buscar emails duplicados e retornar todos exceto o mais antigo
    const { data: duplicates } = await supabase.rpc('find_duplicate_contacts_by_email', {
      org_id: organizationId
    });
    return duplicates?.map((d: any) => d.id) || [];
  }

  const { data, error } = await query.limit(1000);
  
  if (error) {
    console.error('[Bulk Contacts] Filter error:', error);
    return [];
  }

  return data?.map((c: any) => c.id) || [];
}

/**
 * Exclusão em massa de contatos
 */
async function handleBulkDelete(
  supabase: any,
  organizationId: string,
  contactIds: string[],
  options: {
    deleteDeals?: boolean;
    deleteConversations?: boolean;
    deleteActivities?: boolean;
  }
): Promise<NextResponse> {
  const results = {
    contactsDeleted: 0,
    dealsDeleted: 0,
    conversationsDeleted: 0,
    activitiesDeleted: 0,
    errors: [] as string[],
  };

  try {
    // 1. Deletar atividades (sempre, para não ter orfãos)
    const { count: activitiesDeleted } = await supabase
      .from('activities')
      .delete({ count: 'exact' })
      .eq('organization_id', organizationId)
      .in('contact_id', contactIds);
    
    results.activitiesDeleted = activitiesDeleted || 0;

    // 2. Deletar deals se solicitado
    if (options.deleteDeals) {
      const { count: dealsDeleted } = await supabase
        .from('deals')
        .delete({ count: 'exact' })
        .eq('organization_id', organizationId)
        .in('contact_id', contactIds);
      
      results.dealsDeleted = dealsDeleted || 0;
    } else {
      // Apenas desvincular deals (set contact_id = null)
      await supabase
        .from('deals')
        .update({ contact_id: null, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .in('contact_id', contactIds);
    }

    // 3. Deletar conversas WhatsApp se solicitado
    if (options.deleteConversations) {
      // Primeiro deletar mensagens
      const { data: conversations } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('organization_id', organizationId)
        .in('contact_id', contactIds);
      
      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map((c: any) => c.id);
        
        await supabase
          .from('whatsapp_messages')
          .delete()
          .in('conversation_id', conversationIds);
        
        const { count: convsDeleted } = await supabase
          .from('whatsapp_conversations')
          .delete({ count: 'exact' })
          .in('id', conversationIds);
        
        results.conversationsDeleted = convsDeleted || 0;
      }
    } else {
      // Apenas desvincular conversas
      await supabase
        .from('whatsapp_conversations')
        .update({ contact_id: null, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .in('contact_id', contactIds);
    }

    // 4. Deletar pedidos Shopify associados (opcional - desvincular)
    await supabase
      .from('shopify_orders')
      .update({ contact_id: null, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .in('contact_id', contactIds);

    // 5. Deletar contatos
    const { count: contactsDeleted, error: deleteError } = await supabase
      .from('contacts')
      .delete({ count: 'exact' })
      .eq('organization_id', organizationId)
      .in('id', contactIds);

    if (deleteError) {
      throw deleteError;
    }

    results.contactsDeleted = contactsDeleted || 0;

    // 6. Registrar log de auditoria
    await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      action: 'bulk_delete_contacts',
      entity_type: 'contact',
      details: {
        contacts_deleted: results.contactsDeleted,
        deals_deleted: results.dealsDeleted,
        conversations_deleted: results.conversationsDeleted,
        activities_deleted: results.activitiesDeleted,
        options,
      },
      created_at: new Date().toISOString(),
    }).catch(() => {}); // Ignorar erro se tabela não existir

    console.log(`[Bulk Delete] ✅ Deleted ${results.contactsDeleted} contacts for org ${organizationId}`);

    return NextResponse.json({
      success: true,
      results,
      message: `${results.contactsDeleted} contato(s) excluído(s) com sucesso.`,
    });

  } catch (error: any) {
    console.error('[Bulk Delete] Error:', error);
    results.errors.push(error.message);
    return NextResponse.json({
      success: false,
      results,
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * Adicionar tags em massa
 */
async function handleAddTags(
  supabase: any,
  organizationId: string,
  contactIds: string[],
  tags: string[]
): Promise<NextResponse> {
  if (!tags || tags.length === 0) {
    return NextResponse.json({ error: 'Tags required' }, { status: 400 });
  }

  let updated = 0;
  const errors: string[] = [];

  // Processar em lotes de 100
  const batchSize = 100;
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    
    // Buscar tags atuais
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, tags')
      .eq('organization_id', organizationId)
      .in('id', batch);

    if (!contacts) continue;

    // Atualizar cada contato
    for (const contact of contacts) {
      const currentTags = contact.tags || [];
      const newTags = [...new Set([...currentTags, ...tags])];
      
      const { error } = await supabase
        .from('contacts')
        .update({ tags: newTags, updated_at: new Date().toISOString() })
        .eq('id', contact.id);
      
      if (error) {
        errors.push(`${contact.id}: ${error.message}`);
      } else {
        updated++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    results: { updated, errors },
    message: `Tags adicionadas em ${updated} contato(s).`,
  });
}

/**
 * Remover tags em massa
 */
async function handleRemoveTags(
  supabase: any,
  organizationId: string,
  contactIds: string[],
  tags: string[]
): Promise<NextResponse> {
  if (!tags || tags.length === 0) {
    return NextResponse.json({ error: 'Tags required' }, { status: 400 });
  }

  let updated = 0;
  const errors: string[] = [];

  // Processar em lotes de 100
  const batchSize = 100;
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    
    // Buscar tags atuais
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, tags')
      .eq('organization_id', organizationId)
      .in('id', batch);

    if (!contacts) continue;

    // Atualizar cada contato
    for (const contact of contacts) {
      const currentTags = contact.tags || [];
      const newTags = currentTags.filter((t: string) => !tags.includes(t));
      
      const { error } = await supabase
        .from('contacts')
        .update({ tags: newTags, updated_at: new Date().toISOString() })
        .eq('id', contact.id);
      
      if (error) {
        errors.push(`${contact.id}: ${error.message}`);
      } else {
        updated++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    results: { updated, errors },
    message: `Tags removidas de ${updated} contato(s).`,
  });
}
