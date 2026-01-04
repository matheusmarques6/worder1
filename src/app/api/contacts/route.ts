import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { EventBus, EventType } from '@/lib/events';

// GET - List contacts or get single contact
export async function GET(request: NextRequest) {
  // ✅ MIGRADO PARA RLS - usa getAuthClient()
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  // organization_id vem do usuário autenticado, NÃO do request
  const organizationId = user.organization_id;

  const searchParams = request.nextUrl.searchParams;
  const contactId = searchParams.get('id');
  const search = searchParams.get('search');
  const tags = searchParams.get('tags');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    if (contactId) {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          deals(*),
          whatsapp_conversations(
            id,
            status,
            last_message_at,
            last_message_preview
          )
        `)
        .eq('id', contactId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return NextResponse.json({ contact: data });
    }

    let query = supabase
      .from('contacts')
      .select('*, deals(id)', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (tags) {
      const tagList = tags.split(',');
      query = query.contains('tags', tagList);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Adicionar contagem de deals
    const contactsWithDealsCount = data?.map(contact => ({
      ...contact,
      deals_count: contact.deals?.length || 0,
      deals: undefined,
    })) || [];

    return NextResponse.json({
      contacts: contactsWithDealsCount,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create contact
export async function POST(request: NextRequest) {
  // ✅ MIGRADO PARA RLS
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const body = await request.json();
  // Ignorar organizationId do body - usar o do usuário autenticado
  const { organizationId: _, ...contactData } = body;

  try {
    // Check for existing contact by email
    if (contactData.email) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', contactData.email)
        // RLS garante que só vê da própria org
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'Contact with this email already exists' },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId, // Usa org do usuário autenticado
        ...contactData,
        source: contactData.source || 'manual',
      })
      .select()
      .single();

    if (error) throw error;

    // 🔥 EMITIR EVENTO DE CONTATO CRIADO
    EventBus.emit(EventType.CONTACT_CREATED, {
      organization_id: organizationId,
      contact_id: data.id,
      email: data.email,
      phone: data.phone,
      data: {
        first_name: data.first_name,
        last_name: data.last_name,
        source: data.source,
        tags: data.tags,
      },
      source: 'crm',
    }).catch(console.error);

    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update contact
export async function PUT(request: NextRequest) {
  // ✅ MIGRADO PARA RLS
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const body = await request.json();
  // Ignorar organizationId do body
  const { id, organizationId: _, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
  }

  try {
    // Buscar dados anteriores para comparação (RLS filtra automaticamente)
    const { data: previousContact } = await supabase
      .from('contacts')
      .select('tags, email')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      // RLS já garante que só atualiza da própria org
      .select()
      .single();

    if (error) throw error;

    // 🔥 EMITIR EVENTO DE CONTATO ATUALIZADO
    EventBus.emit(EventType.CONTACT_UPDATED, {
      organization_id: organizationId,
      contact_id: id,
      email: data.email,
      data: {
        updated_fields: Object.keys(updates),
      },
      source: 'crm',
    }).catch(console.error);

    // 🔥 VERIFICAR SE TAGS FORAM ADICIONADAS
    if (updates.tags && previousContact?.tags) {
      const previousTags = previousContact.tags || [];
      const newTags = (updates.tags || []).filter((t: string) => !previousTags.includes(t));
      
      for (const tag of newTags) {
        EventBus.emit(EventType.TAG_ADDED, {
          organization_id: organizationId,
          contact_id: id,
          email: data.email,
          data: { tag_name: tag },
          source: 'crm',
        }).catch(console.error);
      }
    }

    return NextResponse.json({ contact: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete contact
export async function DELETE(request: NextRequest) {
  // ✅ MIGRADO PARA RLS
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  // Ignorar organizationId da URL - RLS garante isolamento

  if (!id) {
    return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);
      // RLS já garante que só deleta da própria org

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
