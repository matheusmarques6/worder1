// =============================================
// POST /api/email/sync-defaults
// Aplica remetente (nome / e-mail / reply-to) aos nós de e-mail das
// automações DE UMA LOJA quando o padrão dela muda — o "aplicar a
// todos" Klaviyo-style da tela Configurações → E-mail.
//
// Era o vazamento mais grave da organização: a rota varria TODAS as
// automações da organização, sem olhar store_id. Ao configurar o
// remetente da Medicube (loja nova), 92 e-mails de 21 automações da
// Dr. Groot, Dr. Melaxin e Based passaram a sair como Medicube.
// Agora a loja é obrigatória e só as automações dela mudam; fluxos da
// organização inteira (sem loja) só entram quando pedidos de propósito.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SyncRequest {
  /** Loja cujas automações recebem o remetente. Obrigatória. */
  storeId?: string;
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
  /** Only update resources that currently have empty/old values? */
  onlyEmpty?: boolean;
  /** When provided, only update emails matching the previous email (precise replace). */
  previousEmail?: string;
  /** Também aplicar aos fluxos da organização inteira (sem loja). Padrão: não. */
  includeOrgWide?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;
  const organizationId = user.organization_id;
  const supabase = getSupabaseAdmin();

  let body: SyncRequest;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { storeId, senderName, senderEmail, replyTo, onlyEmpty = false, previousEmail, includeOrgWide = false } = body;

  if (!senderName && !senderEmail && !replyTo) {
    return NextResponse.json({ error: 'At least one of senderName/senderEmail/replyTo required' }, { status: 400 });
  }
  if (!storeId || !UUID_RE.test(storeId)) {
    return NextResponse.json({ error: 'storeId é obrigatório: o remetente é por loja', code: 'store_required' }, { status: 400 });
  }

  // A loja tem de ser de uma organização do usuário.
  const { data: memberships } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id);
  const orgIds = [...new Set([organizationId, ...((memberships || []).map((m: any) => m.organization_id))])];
  const { pickStore, pickStoreError } = await import('@/lib/stores/pick-store');
  const picked = await pickStore<{ id: string; organization_id: string }>(supabase, { orgIds, storeId, select: 'id, organization_id' });
  if (!picked.store) {
    const err = pickStoreError(picked.reason);
    return NextResponse.json({ error: err.error, code: err.code }, { status: err.status });
  }
  const storeOrgId = picked.store.organization_id;

  let automationsUpdated = 0;
  let nodesUpdated = 0;

  // Automações DA LOJA (e, só se pedido, as da organização inteira).
  let q = supabase
    .from('automations')
    .select('id, nodes, store_id')
    .eq('organization_id', storeOrgId);
  q = includeOrgWide ? q.or(`store_id.eq.${storeId},store_id.is.null`) : q.eq('store_id', storeId);
  const { data: automations, error: listErr } = await q;
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  for (const auto of automations || []) {
    if (!Array.isArray(auto.nodes)) continue;
    let changed = false;
    const newNodes = auto.nodes.map((node: any) => {
      if (node?.data?.nodeType !== 'action_email') return node;
      const cfg = { ...(node.data.config || {}) };
      let nodeChanged = false;

      const shouldUpdate = (key: string, currentValue: any) => {
        if (onlyEmpty) return !currentValue || currentValue === '';
        if (previousEmail && key === 'senderEmail') {
          return !currentValue || currentValue === previousEmail;
        }
        return true;
      };

      if (senderName && shouldUpdate('senderName', cfg.senderName)) {
        if (cfg.senderName !== senderName) { cfg.senderName = senderName; nodeChanged = true; }
      }
      if (senderEmail && shouldUpdate('senderEmail', cfg.senderEmail)) {
        if (cfg.senderEmail !== senderEmail) { cfg.senderEmail = senderEmail; nodeChanged = true; }
      }
      if (replyTo && shouldUpdate('replyTo', cfg.replyTo)) {
        if (cfg.replyTo !== replyTo) { cfg.replyTo = replyTo; nodeChanged = true; }
      }

      if (nodeChanged) {
        changed = true;
        nodesUpdated++;
        return { ...node, data: { ...node.data, config: cfg } };
      }
      return node;
    });

    if (changed) {
      // A loja na cláusula é a cerca: nenhuma automação de outra loja muda.
      const { error: updErr } = await supabase
        .from('automations')
        .update({ nodes: newNodes, updated_at: new Date().toISOString() })
        .eq('id', auto.id)
        .eq('organization_id', storeOrgId);
      if (!updErr) automationsUpdated++;
      else console.error('[sync-defaults] automation update error:', updErr);
    }
  }

  // email_templates não guarda remetente (não há colunas from_*); o
  // remetente de campanha é definido ao criar a campanha, a partir do
  // padrão da loja.
  return NextResponse.json({
    success: true,
    storeId,
    automationsUpdated,
    nodesUpdated,
    templatesUpdated: 0,
  });
}
