import { NextRequest, NextResponse } from 'next/server';
import { requireOrg } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Sem sessão e sem organização, o id do modelo abria o histórico de
  // qualquer organização.
  const guard = await requireOrg();
  if (!guard.ok) return guard.response;
  const { supabase, organizationId } = guard;

  try {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('category_change_history, last_category_change_at, name, category, status')
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return NextResponse.json({ history: [] });
    }

    const history = Array.isArray(data.category_change_history)
      ? data.category_change_history
      : [];

    return NextResponse.json({
      history,
      template: {
        name: data.name,
        category: data.category,
        status: data.status,
        last_category_change_at: data.last_category_change_at,
      },
    });
  } catch (err: any) {
    console.error('[templates/history] error:', err);
    return NextResponse.json({ history: [] });
  }
}
