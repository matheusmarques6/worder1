import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

// GET - List contacts or get single contact
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const contactId = searchParams.get('id');
  const search = searchParams.get('search');
  const tags = searchParams.get('tags');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }

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
      .select('*', { count: 'exact' })
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

    return NextResponse.json({
      contacts: data,
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
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const body = await request.json();
  const { organizationId, ...contactData } = body;

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }

  try {
    // Check for existing contact by email
    if (contactData.email) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('email', contactData.email)
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
        organization_id: organizationId,
        ...contactData,
        source: contactData.source || 'manual',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update contact
export async function PUT(request: NextRequest) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { id, organizationId, ...updates } = await request.json();

  if (!id || !organizationId) {
    return NextResponse.json({ error: 'Contact ID and Organization ID required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ contact: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete contact
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const organizationId = searchParams.get('organizationId');

  if (!id || !organizationId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
