import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ files: [] });

    const { data, error } = await supabase
      .from('media_files')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ files: data || [] });
  } catch (e: any) {
    return NextResponse.json({ files: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase)
      return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const body = await request.json();
    const { name, url, size, type, base64 } = body;

    const { data, error } = await supabase
      .from('media_files')
      .insert({
        organization_id: organizationId,
        name,
        url: url || '',
        size: size || 0,
        type: type || 'image',
        base64_data: base64 || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase)
      return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { id } = await request.json();
    const { error } = await supabase
      .from('media_files')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
