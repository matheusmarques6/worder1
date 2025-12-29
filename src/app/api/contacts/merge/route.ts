// =============================================
// Merge Contacts API
// src/app/api/contacts/merge/route.ts
//
// POST: Fazer merge de contatos duplicados
// GET: Detectar possíveis duplicados
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
// GET - Detectar possíveis duplicados
// =============================================
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const limit = parseInt(searchParams.get('limit') || '50');
  
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }
  
  try {
    // Buscar todos os contatos
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, email, phone, first_name, last_name, total_orders, total_spent, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ duplicates: [] });
    }
    
    // Detectar duplicados por email
    const emailGroups: Record<string, any[]> = {};
    const phoneGroups: Record<string, any[]> = {};
    const nameGroups: Record<string, any[]> = {};
    
    contacts.forEach(contact => {
      // Por email
      if (contact.email) {
        const normalizedEmail = contact.email.toLowerCase().trim();
        if (!emailGroups[normalizedEmail]) {
          emailGroups[normalizedEmail] = [];
        }
        emailGroups[normalizedEmail].push(contact);
      }
      
      // Por telefone
      if (contact.phone) {
        const normalizedPhone = contact.phone.replace(/\D/g, '');
        if (normalizedPhone.length >= 10) {
          if (!phoneGroups[normalizedPhone]) {
            phoneGroups[normalizedPhone] = [];
          }
          phoneGroups[normalizedPhone].push(contact);
        }
      }
      
      // Por nome (fuzzy)
      if (contact.first_name && contact.last_name) {
        const normalizedName = `${contact.first_name} ${contact.last_name}`.toLowerCase().trim();
        if (!nameGroups[normalizedName]) {
          nameGroups[normalizedName] = [];
        }
        nameGroups[normalizedName].push(contact);
      }
    });
    
    // Montar lista de duplicados
    const duplicates: any[] = [];
    const processedIds = new Set<string>();
    
    // Duplicados por email (maior confiança)
    Object.entries(emailGroups)
      .filter(([_, contacts]) => contacts.length > 1)
      .forEach(([email, contacts]) => {
        const ids = contacts.map(c => c.id).sort().join(',');
        if (!processedIds.has(ids)) {
          processedIds.add(ids);
          duplicates.push({
            matchType: 'email',
            matchValue: email,
            confidence: 'high',
            contacts: contacts.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0)),
          });
        }
      });
    
    // Duplicados por telefone (alta confiança)
    Object.entries(phoneGroups)
      .filter(([_, contacts]) => contacts.length > 1)
      .forEach(([phone, contacts]) => {
        const ids = contacts.map(c => c.id).sort().join(',');
        if (!processedIds.has(ids)) {
          processedIds.add(ids);
          duplicates.push({
            matchType: 'phone',
            matchValue: phone,
            confidence: 'high',
            contacts: contacts.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0)),
          });
        }
      });
    
    // Duplicados por nome (média confiança)
    Object.entries(nameGroups)
      .filter(([_, contacts]) => contacts.length > 1)
      .forEach(([name, contacts]) => {
        const ids = contacts.map(c => c.id).sort().join(',');
        if (!processedIds.has(ids)) {
          processedIds.add(ids);
          duplicates.push({
            matchType: 'name',
            matchValue: name,
            confidence: 'medium',
            contacts: contacts.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0)),
          });
        }
      });
    
    // Ordenar por confiança e limitar
    const sortedDuplicates = duplicates
      .sort((a, b) => {
        const confidenceOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (confidenceOrder[b.confidence] || 0) - (confidenceOrder[a.confidence] || 0);
      })
      .slice(0, limit);
    
    return NextResponse.json({
      duplicates: sortedDuplicates,
      totalGroups: duplicates.length,
      summary: {
        byEmail: Object.values(emailGroups).filter(g => g.length > 1).length,
        byPhone: Object.values(phoneGroups).filter(g => g.length > 1).length,
        byName: Object.values(nameGroups).filter(g => g.length > 1).length,
      },
    });
    
  } catch (error: any) {
    console.error('[Merge Contacts API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Fazer merge de contatos
// =============================================
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const body = await request.json();
    const { organizationId, primaryContactId, secondaryContactIds } = body;
    
    if (!organizationId || !primaryContactId || !secondaryContactIds?.length) {
      return NextResponse.json(
        { error: 'organizationId, primaryContactId and secondaryContactIds are required' },
        { status: 400 }
      );
    }
    
    // Buscar contatos
    const allContactIds = [primaryContactId, ...secondaryContactIds];
    const { data: contacts, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .in('id', allContactIds);
    
    if (fetchError || !contacts?.length) {
      return NextResponse.json(
        { error: 'Contacts not found' },
        { status: 404 }
      );
    }
    
    const primary = contacts.find(c => c.id === primaryContactId);
    const secondaries = contacts.filter(c => c.id !== primaryContactId);
    
    if (!primary) {
      return NextResponse.json(
        { error: 'Primary contact not found' },
        { status: 404 }
      );
    }
    
    // ========================================
    // Fazer merge dos dados
    // ========================================
    
    // Combinar tags (único)
    const allTags = [
      ...(primary.tags || []),
      ...secondaries.flatMap(s => s.tags || []),
    ];
    const uniqueTags = [...new Set(allTags)];
    
    // Somar métricas
    const totalOrders = (primary.total_orders || 0) + 
      secondaries.reduce((sum, s) => sum + (s.total_orders || 0), 0);
    const totalSpent = (primary.total_spent || 0) + 
      secondaries.reduce((sum, s) => sum + (s.total_spent || 0), 0);
    
    // Merge custom_fields (secundários preenchem gaps do primário)
    const mergedCustomFields = {
      ...secondaries.reduce((acc, s) => ({ ...acc, ...(s.custom_fields || {}) }), {}),
      ...(primary.custom_fields || {}), // Primário tem prioridade
    };
    
    // Pegar dados mais recentes que estão faltando no primário
    const fillGaps: any = {};
    
    // Email - usar o primeiro disponível
    if (!primary.email) {
      const emailFromSecondary = secondaries.find(s => s.email)?.email;
      if (emailFromSecondary) fillGaps.email = emailFromSecondary;
    }
    
    // Phone
    if (!primary.phone) {
      const phoneFromSecondary = secondaries.find(s => s.phone)?.phone;
      if (phoneFromSecondary) fillGaps.phone = phoneFromSecondary;
    }
    
    // Company
    if (!primary.company) {
      const companyFromSecondary = secondaries.find(s => s.company)?.company;
      if (companyFromSecondary) fillGaps.company = companyFromSecondary;
    }
    
    // Last order (pegar o mais recente)
    const allLastOrders = [primary, ...secondaries]
      .filter(c => c.last_order_at)
      .sort((a, b) => new Date(b.last_order_at).getTime() - new Date(a.last_order_at).getTime());
    
    if (allLastOrders.length > 0 && (!primary.last_order_at || 
        new Date(allLastOrders[0].last_order_at) > new Date(primary.last_order_at))) {
      fillGaps.last_order_at = allLastOrders[0].last_order_at;
      fillGaps.last_order_id = allLastOrders[0].last_order_id;
      fillGaps.last_order_value = allLastOrders[0].last_order_value;
      fillGaps.last_order_number = allLastOrders[0].last_order_number;
    }
    
    // First order (pegar o mais antigo)
    const allFirstOrders = [primary, ...secondaries]
      .filter(c => c.first_order_at)
      .sort((a, b) => new Date(a.first_order_at).getTime() - new Date(b.first_order_at).getTime());
    
    if (allFirstOrders.length > 0 && (!primary.first_order_at || 
        new Date(allFirstOrders[0].first_order_at) < new Date(primary.first_order_at))) {
      fillGaps.first_order_at = allFirstOrders[0].first_order_at;
    }
    
    // ========================================
    // Atualizar contato primário
    // ========================================
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        ...fillGaps,
        tags: uniqueTags,
        total_orders: totalOrders,
        total_spent: totalSpent,
        average_order_value: totalOrders > 0 ? totalSpent / totalOrders : 0,
        custom_fields: mergedCustomFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', primaryContactId);
    
    if (updateError) {
      console.error('[Merge] Error updating primary:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    
    // ========================================
    // Transferir relacionamentos
    // ========================================
    
    // Transferir deals
    const { error: dealsError } = await supabase
      .from('deals')
      .update({ contact_id: primaryContactId, updated_at: new Date().toISOString() })
      .in('contact_id', secondaryContactIds);
    
    if (dealsError) {
      console.error('[Merge] Error transferring deals:', dealsError);
    }
    
    // Transferir conversas WhatsApp
    const { error: conversationsError } = await supabase
      .from('whatsapp_conversations')
      .update({ contact_id: primaryContactId, updated_at: new Date().toISOString() })
      .in('contact_id', secondaryContactIds);
    
    if (conversationsError) {
      console.error('[Merge] Error transferring conversations:', conversationsError);
    }
    
    // Transferir atividades (manter todas)
    const { error: activitiesError } = await supabase
      .from('contact_activities')
      .update({ contact_id: primaryContactId })
      .in('contact_id', secondaryContactIds);
    
    if (activitiesError) {
      console.error('[Merge] Error transferring activities:', activitiesError);
    }
    
    // Transferir purchases
    const { error: purchasesError } = await supabase
      .from('contact_purchases')
      .update({ contact_id: primaryContactId })
      .in('contact_id', secondaryContactIds);
    
    if (purchasesError) {
      console.error('[Merge] Error transferring purchases:', purchasesError);
    }
    
    // ========================================
    // Registrar atividade de merge
    // ========================================
    await supabase.from('contact_activities').insert({
      organization_id: organizationId,
      contact_id: primaryContactId,
      type: 'merge',
      title: `Contatos mesclados`,
      description: `${secondaries.length} contato(s) mesclado(s) com este`,
      metadata: {
        merged_contacts: secondaryContactIds,
        merged_names: secondaries.map(s => `${s.first_name || ''} ${s.last_name || ''}`.trim()),
        merged_emails: secondaries.map(s => s.email).filter(Boolean),
      },
      source: 'system',
      occurred_at: new Date().toISOString(),
    });
    
    // ========================================
    // Deletar contatos secundários
    // ========================================
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .in('id', secondaryContactIds);
    
    if (deleteError) {
      console.error('[Merge] Error deleting secondaries:', deleteError);
      // Não falha o merge, só loga
    }
    
    // ========================================
    // Buscar contato atualizado
    // ========================================
    const { data: mergedContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', primaryContactId)
      .single();
    
    return NextResponse.json({
      success: true,
      message: `${secondaries.length} contato(s) mesclado(s) com sucesso`,
      contact: mergedContact,
      stats: {
        dealsTransferred: !dealsError,
        conversationsTransferred: !conversationsError,
        activitiesTransferred: !activitiesError,
        secondariesDeleted: !deleteError,
      },
    });
    
  } catch (error: any) {
    console.error('[Merge Contacts API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
