import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-route';


async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

// GET - Lista tags
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('whatsapp_chat_tags')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ tags: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar tag ou gerenciar atribuição
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    if (action === 'assign') {
      const { conversation_id, tag_id } = body;
      if (!conversation_id || !tag_id) {
        return NextResponse.json({ error: 'conversation_id and tag_id required' }, { status: 400 });
      }

      // Verificar conversa
      const { data: conv } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('id', conversation_id)
        .eq('organization_id', orgId)
        .single();

      if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

      // Verificar tag
      const { data: tag } = await supabase
        .from('whatsapp_chat_tags')
        .select('id')
        .eq('id', tag_id)
        .eq('organization_id', orgId)
        .single();

      if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('whatsapp_conversation_tags').upsert({
        conversation_id,
        tag_id,
        added_by: user?.id,
        added_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,tag_id' });

      return NextResponse.json({ success: true });
    }

    if (action === 'remove') {
      const { conversation_id, tag_id } = body;
      await supabase.from('whatsapp_conversation_tags').delete()
        .eq('conversation_id', conversation_id)
        .eq('tag_id', tag_id);
      return NextResponse.json({ success: true });
    }

    // Criar tag
    const { title, color = '#6366F1', description } = body;
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    const { data, error } = await supabase
      .from('whatsapp_chat_tags')
      .insert({ organization_id: orgId, title, color, description })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar tag
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, title, color, description } = body;
    if (!id) return NextResponse.json({ error: 'Tag ID required' }, { status: 400 });

    const updateData: any = {};
    if (title) updateData.title = title;
    if (color) updateData.color = color;
    if (description !== undefined) updateData.description = description;

    const { data, error } = await supabase
      .from('whatsapp_chat_tags')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ tag: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Deletar tag
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Tag ID required' }, { status: 400 });

    await supabase.from('whatsapp_conversation_tags').delete().eq('tag_id', id);
    await supabase.from('whatsapp_chat_tags').delete().eq('id', id).eq('organization_id', orgId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
