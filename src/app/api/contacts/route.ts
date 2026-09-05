import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, validateStoreAccess } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { EventBus, EventType } from '@/lib/events';
export const dynamic = 'force-dynamic';

// GET - List contacts or get single contact
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const { user } = auth;
  const supabase = getSupabaseAdmin();

  // Get org IDs: user's primary org + orgs where user is a member
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);

  const orgIds = [...new Set([
    user.organization_id,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];

  console.log(`[Contacts GET] userId=${user.id}, orgIds=${orgIds.join(',')}`);

  const searchParams = request.nextUrl.searchParams;
  const contactId = searchParams.get('id');
  const search = searchParams.get('search');
  const tags = searchParams.get('tags');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  // Cap the page size so a crafted ?limit=1000000 can't pull the whole table
  // into one response and exhaust memory/bandwidth.
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 200);
  const storeId = searchParams.get('storeId');
  const sort = searchParams.get('sort');
  const source = searchParams.get('source');
  const subscribed = searchParams.get('subscribed');

  try {
    // Se buscar por ID específico
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
        .in('organization_id', orgIds)
        .single();

      if (error) throw error;
      return NextResponse.json({ contact: data });
    }

    // Listagem — busca em TODAS as orgs do usuário
    // NOTE: Removed deals(id) join — FK may not exist and causes 500 errors
    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .in('organization_id', orgIds)
      .range((page - 1) * limit, page * limit - 1);

    // Sort
    if (sort === 'name_asc') {
      query = query.order('first_name', { ascending: true });
    } else if (sort === 'most_orders') {
      query = query.order('total_orders', { ascending: false, nullsFirst: false });
    } else if (sort === 'highest_spent') {
      query = query.order('total_spent', { ascending: false, nullsFirst: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // Se storeId fornecido, filtrar por store — depois de conferir que a
    // loja é de uma organização do usuário. Um id de outra organização
    // não devolve nada, em vez de virar filtro válido.
    if (storeId) {
      const access = await validateStoreAccess(supabase, user.organization_id, storeId, user.id);
      if (!access.valid) {
        return NextResponse.json({ error: access.error }, { status: access.status || 403 });
      }
      query = query.eq('store_id', storeId);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (tags) {
      const tagList = tags.split(',');
      query = query.contains('tags', tagList);
    }

    if (source) {
      query = query.eq('source', source);
    }

    if (subscribed === 'true') {
      query = query.eq('is_subscribed_email', true);
    } else if (subscribed === 'false') {
      query = query.eq('is_subscribed_email', false);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      contacts: data || [],
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    console.error('[Contacts API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create new contact
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { email, phone, first_name, last_name, tags, source, store_id } = body;

    // Configurações → Entregabilidade → "Validar e-mails na entrada"
    if (email) {
      const { checkEmail, emailCheckMessage, shouldValidateOnEntry } = await import('@/lib/email/email-hygiene');
      if (await shouldValidateOnEntry(organizationId)) {
        const c = checkEmail(email);
        if (!c.ok) return NextResponse.json({ error: emailCheckMessage(c), suggestion: c.suggestion }, { status: 400 });
      }
    }

    // Check for existing contact
    if (email) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('email', email)
        .single();

      if (existing) {
        return NextResponse.json({ 
          error: 'Contact with this email already exists',
          existingId: existing.id 
        }, { status: 409 });
      }
    }

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        store_id: store_id || null, // ✅ SALVAR STORE_ID
        email,
        phone,
        first_name,
        last_name,
        tags: tags || [],
        source: source || 'manual',
      })
      .select()
      .single();

    if (error) throw error;

    EventBus.emit(EventType.CONTACT_CREATED, {
      organization_id: organizationId,
      contact_id: contact.id,
      email: contact.email,
      data: { contact },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error: any) {
    console.error('[Contacts API] Create error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update contact
export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
    }

    delete updates.organization_id;
    delete updates.created_at;

    const { data: contact, error } = await supabase
      .from('contacts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    EventBus.emit(EventType.CONTACT_UPDATED, {
      organization_id: organizationId,
      contact_id: contact.id,
      email: contact.email,
      data: { contact },
    });

    return NextResponse.json({ contact });
  } catch (error: any) {
    console.error('[Contacts API] Update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete contact
export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    EventBus.emit(EventType.CONTACT_DELETED, {
      organization_id: organizationId,
      contact_id: id,
      data: { contactId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Contacts API] Delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
