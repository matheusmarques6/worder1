import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

// GET - List activities for a contact
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const contactId = searchParams.get('contactId');
  const organizationId = searchParams.get('organizationId');

  if (!contactId || !organizationId) {
    return NextResponse.json({ error: 'contactId and organizationId required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('contact_activities')
      .select('*')
      .eq('contact_id', contactId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ activities: data || [] });
  } catch (error: any) {
    console.error('Error fetching activities:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create activity
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { contactId, organizationId, type, title, description, userId } = body;

    console.log('Creating activity:', { contactId, organizationId, type, title });

    if (!contactId || !organizationId || !type || !title) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        received: { contactId, organizationId, type, title }
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('contact_activities')
      .insert({
        contact_id: contactId,
        organization_id: organizationId,
        user_id: userId || null,
        type,
        title,
        description: description || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log('Activity created:', data);
    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating activity:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete activity
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const organizationId = searchParams.get('organizationId');

  if (!id || !organizationId) {
    return NextResponse.json({ error: 'id and organizationId required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('contact_activities')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting activity:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
