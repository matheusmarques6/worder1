import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { EventBus, EventType } from '@/lib/events';

// GET - List contacts or get single contact
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const searchParams = request.nextUrl.searchParams;
  const contactId = searchParams.get('id');
  const search = searchParams.get('search');
  const tags = searchParams.get('tags');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  
  // ✅ FILTRO POR LOJA
  const storeId = searchParams.get('storeId');

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

    // ✅ FILTRAR POR STORE_ID SE FORNECIDO
    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (tags) {
      const tagList = tags.split(',');
      query = query.contains('tags', tagList);
    }

    const { data, error, count } = await query;

    if (error) throw error;

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

    EventBus.getInstance().emit({
      type: EventType.CONTACT_CREATED,
      organizationId,
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

    EventBus.getInstance().emit({
      type: EventType.CONTACT_UPDATED,
      organizationId,
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

    EventBus.getInstance().emit({
      type: EventType.CONTACT_DELETED,
      organizationId,
      data: { contactId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Contacts API] Delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
