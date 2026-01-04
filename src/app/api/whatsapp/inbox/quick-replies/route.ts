import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .select('*')
      .eq('organization_id', organizationId)
      .order('title');

    if (error) throw error;
    return NextResponse.json({ quickReplies: data || [] });
  } catch (error: any) {
    console.error('Quick replies GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { title, shortcut, content, category } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .insert({
        organization_id: organizationId,
        title,
        shortcut,
        content,
        category,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ quickReply: data }, { status: 201 });
  } catch (error: any) {
    console.error('Quick reply POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_quick_replies')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ quickReply: data });
  } catch (error: any) {
    console.error('Quick reply PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('whatsapp_quick_replies')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Quick reply DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
