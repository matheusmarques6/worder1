// =============================================
// Merge Contacts API
// src/app/api/contacts/merge/route.ts
//
// POST: Fazer merge de contatos duplicados
// GET: Detectar possíveis duplicados
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// =============================================
// GET - Detectar possíveis duplicados
// =============================================
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;
  
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '50');
  
  try {
    // RLS filtra automaticamente por organization_id
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, email, phone, first_name, last_name, total_orders, total_spent, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ duplicates: [] });
    }
    
    const emailGroups: Record<string, any[]> = {};
    const phoneGroups: Record<string, any[]> = {};
    const nameGroups: Record<string, any[]> = {};
    
    contacts.forEach(contact => {
      if (contact.email) {
        const normalizedEmail = contact.email.toLowerCase().trim();
        if (!emailGroups[normalizedEmail]) {
          emailGroups[normalizedEmail] = [];
        }
        emailGroups[normalizedEmail].push(contact);
      }
      
      if (contact.phone) {
        const normalizedPhone = contact.phone.replace(/\D/g, '');
        if (normalizedPhone.length >= 10) {
          if (!phoneGroups[normalizedPhone]) {
            phoneGroups[normalizedPhone] = [];
          }
          phoneGroups[normalizedPhone].push(contact);
        }
      }
      
      if (contact.first_name && contact.last_name) {
        const normalizedName = `${contact.first_name} ${contact.last_name}`.toLowerCase().trim();
        if (!nameGroups[normalizedName]) {
          nameGroups[normalizedName] = [];
        }
        nameGroups[normalizedName].push(contact);
      }
    });
    
    const duplicates: any[] = [];
    const processedIds = new Set<string>();
    
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
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  
  try {
    const body = await request.json();
    const { action, primaryContactId, secondaryContactIds } = body;
    
    // Se for ação de detectar
    if (action === 'detect') {
      // RLS filtra automaticamente
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, email, phone, first_name, last_name, total_orders, total_spent, created_at')
        .order('created_at', { ascending: false });
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      if (!contacts || contacts.length === 0) {
        return NextResponse.json({ duplicates: [] });
      }
      
      const emailGroups: Record<string, any[]> = {};
      
      contacts.forEach(contact => {
        if (contact.email) {
          const normalizedEmail = contact.email.toLowerCase().trim();
          if (!emailGroups[normalizedEmail]) {
            emailGroups[normalizedEmail] = [];
          }
          emailGroups[normalizedEmail].push(contact);
        }
      });
      
      const duplicates = Object.values(emailGroups)
        .filter(g => g.length > 1)
        .map(group => ({
          matchType: 'email',
          matchValue: group[0].email,
          contacts: group,
          confidence: 100,
        }));
      
      return NextResponse.json({
        duplicates,
        totalGroups: duplicates.length,
      });
    }
    
    // Lógica de merge
    if (!primaryContactId || !secondaryContactIds?.length) {
      return NextResponse.json(
        { error: 'primaryContactId and secondaryContactIds are required' },
        { status: 400 }
      );
    }
    
    // RLS filtra automaticamente
    const allContactIds = [primaryContactId, ...secondaryContactIds];
    const { data: contacts, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .in('id', allContactIds);
    
    if (fetchError || !contacts?.length) {
      return NextResponse.json({ error: 'Contacts not found' }, { status: 404 });
    }
    
    const primary = contacts.find(c => c.id === primaryContactId);
    const secondaries = contacts.filter(c => c.id !== primaryContactId);
    
    if (!primary) {
      return NextResponse.json({ error: 'Primary contact not found' }, { status: 404 });
    }
    
    // Fazer merge dos dados
    const allTags = [
      ...(primary.tags || []),
      ...secondaries.flatMap(s => s.tags || []),
    ];
    const uniqueTags = [...new Set(allTags)];
    
    const totalOrders = (primary.total_orders || 0) + 
      secondaries.reduce((sum, s) => sum + (s.total_orders || 0), 0);
    const totalSpent = (primary.total_spent || 0) + 
      secondaries.reduce((sum, s) => sum + (s.total_spent || 0), 0);
    
    const mergedCustomFields = {
      ...secondaries.reduce((acc, s) => ({ ...acc, ...(s.custom_fields || {}) }), {}),
      ...(primary.custom_fields || {}),
    };
    
    const fillGaps: any = {};
    
    if (!primary.email) {
      const emailFromSecondary = secondaries.find(s => s.email)?.email;
      if (emailFromSecondary) fillGaps.email = emailFromSecondary;
    }
    
    if (!primary.phone) {
      const phoneFromSecondary = secondaries.find(s => s.phone)?.phone;
      if (phoneFromSecondary) fillGaps.phone = phoneFromSecondary;
    }
    
    if (!primary.company) {
      const companyFromSecondary = secondaries.find(s => s.company)?.company;
      if (companyFromSecondary) fillGaps.company = companyFromSecondary;
    }
    
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
    
    const allFirstOrders = [primary, ...secondaries]
      .filter(c => c.first_order_at)
      .sort((a, b) => new Date(a.first_order_at).getTime() - new Date(b.first_order_at).getTime());
    
    if (allFirstOrders.length > 0 && (!primary.first_order_at || 
        new Date(allFirstOrders[0].first_order_at) < new Date(primary.first_order_at))) {
      fillGaps.first_order_at = allFirstOrders[0].first_order_at;
    }
    
    // Atualizar contato primário
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
    
    // Transferir relacionamentos - RLS filtra automaticamente
    const { error: dealsError } = await supabase
      .from('deals')
      .update({ contact_id: primaryContactId, updated_at: new Date().toISOString() })
      .in('contact_id', secondaryContactIds);
    
    if (dealsError) console.error('[Merge] Error transferring deals:', dealsError);
    
    const { error: conversationsError } = await supabase
      .from('whatsapp_conversations')
      .update({ contact_id: primaryContactId, updated_at: new Date().toISOString() })
      .in('contact_id', secondaryContactIds);
    
    if (conversationsError) console.error('[Merge] Error transferring conversations:', conversationsError);
    
    const { error: activitiesError } = await supabase
      .from('contact_activities')
      .update({ contact_id: primaryContactId })
      .in('contact_id', secondaryContactIds);
    
    if (activitiesError) console.error('[Merge] Error transferring activities:', activitiesError);
    
    const { error: purchasesError } = await supabase
      .from('contact_purchases')
      .update({ contact_id: primaryContactId })
      .in('contact_id', secondaryContactIds);
    
    if (purchasesError) console.error('[Merge] Error transferring purchases:', purchasesError);
    
    // Registrar atividade de merge
    await supabase.from('contact_activities').insert({
      organization_id: user.organization_id,
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
    
    // Deletar contatos secundários
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .in('id', secondaryContactIds);
    
    if (deleteError) console.error('[Merge] Error deleting secondaries:', deleteError);
    
    // Buscar contato atualizado
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
