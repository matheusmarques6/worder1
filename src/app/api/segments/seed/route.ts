// POST /api/segments/seed — create default dynamic segments for an org
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const DEFAULT_SEGMENTS = [
  {
    name: 'Engajados 30d',
    description: 'Contatos ativos nos últimos 30 dias',
    segment_type: 'dynamic',
    color: '#22C55E',
    icon: 'heart',
    rules: [{ field: 'last_active_at', operator: 'greater_than', value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }],
  },
  {
    name: 'Não Engajados 90d',
    description: 'Sem interação nos últimos 90 dias',
    segment_type: 'dynamic',
    color: '#6B7280',
    icon: 'user-x',
    rules: [{ field: 'last_active_at', operator: 'less_than', value: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() }],
  },
  {
    name: 'Recorrentes 2+',
    description: 'Clientes com 2 ou mais compras',
    segment_type: 'dynamic',
    color: '#3B82F6',
    icon: 'refresh',
    rules: [{ field: 'total_orders', operator: 'greater_than', value: 1 }],
  },
  {
    name: 'Novos 7d',
    description: 'Cadastrados nos últimos 7 dias',
    segment_type: 'dynamic',
    color: '#8B5CF6',
    icon: 'user-plus',
    rules: [{ field: 'created_at', operator: 'greater_than', value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }],
  },
  {
    name: 'Nunca Comprou',
    description: 'Contatos que nunca realizaram uma compra',
    segment_type: 'dynamic',
    color: '#F59E0B',
    icon: 'shopping-cart',
    rules: [{ field: 'total_orders', operator: 'equals', value: 0 }],
  },
  {
    name: 'Risco de Churn',
    description: 'Clientes inativos há mais de 60 dias com compras anteriores',
    segment_type: 'dynamic',
    color: '#EF4444',
    icon: 'alert',
    rules: [
      { field: 'total_orders', operator: 'greater_than', value: 0 },
      { field: 'days_since_last_order', operator: 'greater_than', value: 60 },
    ],
  },
  {
    name: 'VIP',
    description: 'Clientes com lifecycle_stage VIP ou 5+ pedidos',
    segment_type: 'dynamic',
    color: '#F26B2A',
    icon: 'crown',
    rules: [{ field: 'total_orders', operator: 'greater_than', value: 4 }],
  },
  {
    name: 'Carrinho Abandonado',
    description: 'Contatos com checkout abandonado nos últimos 30 dias',
    segment_type: 'dynamic',
    color: '#F97316',
    icon: 'shopping-bag',
    rules: [{ field: 'tags', operator: 'contains', value: 'carrinho-abandonado' }],
  },
];

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const orgId = auth.user.organization_id;

  // Check if segments already exist
  const { data: existing } = await supabase
    .from('customer_segments')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ message: 'Segments already exist', count: existing.length });
  }

  let created = 0;
  for (const seg of DEFAULT_SEGMENTS) {
    const { error } = await supabase.from('customer_segments').insert({
      organization_id: orgId,
      ...seg,
      rules_logic: 'AND',
      is_active: true,
    });
    if (!error) created++;
  }

  return NextResponse.json({ success: true, created });
}
