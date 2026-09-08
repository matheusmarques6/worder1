// =============================================================
// Mapeamento de variáveis de evento
//
// GET    — catálogo + mapeamento salvo + o que cada variável resolve
//          contra um evento REAL recente. Sem esse último pedaço a
//          tela vira adivinhação: o lojista precisa ver o valor.
// PUT    — salva o mapeamento de uma variável
// DELETE — volta a variável para a cascata padrão
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  EVENT_TAGS, PLATFORM_TAGS, TAG_GROUP_LABELS,
  eventTagsForTrigger, CATALOG_BY_TAG,
} from '@/lib/merge-tags/catalog';
import { buildMappingIndex, resolveEventTag, type TagMappingOverride } from '@/lib/merge-tags/resolve';

export const dynamic = 'force-dynamic';

/** Os event_type que representam cada gatilho — mesma tabela do discover. */
const TRIGGER_TO_EVENT_TYPES: Record<string, string[]> = {
  trigger_order: ['placed_order'],
  trigger_order_paid: ['placed_order'],
  trigger_checkout_abandoned: ['checkout_started'],
  trigger_abandon: ['added_to_cart', 'checkout_started'],
  trigger_added_to_cart: ['added_to_cart'],
  trigger_fulfilled_order: ['fulfilled_order'],
  trigger_cancelled_order: ['cancelled_order'],
  trigger_viewed_product: ['viewed_product'],
  trigger_browse_abandoned: ['viewed_product', 'page_viewed'],
  trigger_back_in_stock: ['back_in_stock'],
};

async function loadOverrides(orgId: string, storeId: string | null): Promise<TagMappingOverride[]> {
  // Escopo de loja ganha do escopo da organização quando os dois
  // existem para a mesma variável.
  let q = supabaseAdmin
    .from('merge_tag_mappings')
    .select('tag, paths, default_value, store_id')
    .eq('organization_id', orgId);
  const { data } = await q;
  const rows = (data || []) as any[];
  const daOrg = rows.filter((r) => !r.store_id);
  const daLoja = storeId ? rows.filter((r) => r.store_id === storeId) : [];
  const merged = new Map<string, TagMappingOverride>();
  for (const r of [...daOrg, ...daLoja]) {
    merged.set(r.tag, { tag: r.tag, paths: r.paths || [], defaultValue: r.default_value });
  }
  return [...merged.values()];
}

export async function GET(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const triggerType = req.nextUrl.searchParams.get('triggerType');
  const storeId = req.nextUrl.searchParams.get('storeId');

  const overrides = await loadOverrides(orgId, storeId);
  const index = buildMappingIndex(overrides);

  // Um evento recente de verdade, para mostrar o valor resolvido. Sem
  // ele a tela só mostraria caminhos, e caminho não diz se funciona.
  let sampleEvent: any = null;
  let sampleAt: string | null = null;
  const eventTypes = triggerType ? TRIGGER_TO_EVENT_TYPES[triggerType] : undefined;
  try {
    let q = supabaseAdmin
      .from('contact_events')
      .select('properties, occurred_at, event_type')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(1);
    if (eventTypes?.length) q = q.in('event_type', eventTypes);
    if (storeId) q = q.eq('store_id', storeId);
    const { data } = await q;
    if (data?.[0]) {
      sampleEvent = { properties: data[0].properties };
      sampleAt = data[0].occurred_at;
    }
  } catch {
    // A amostra é um extra; a tela funciona sem ela.
  }

  const specs = triggerType ? eventTagsForTrigger(triggerType) : EVENT_TAGS;

  const eventTags = specs.map((s) => {
    const override = index.get(s.tag);
    const resolved = sampleEvent ? resolveEventTag(s.tag, sampleEvent, index) : null;
    return {
      tag: s.tag,
      label: s.label,
      group: s.group,
      groupLabel: TAG_GROUP_LABELS[s.group],
      description: s.description ?? null,
      sample: s.sample,
      isUrl: Boolean(s.isUrl),
      defaultPaths: s.paths || [],
      // null = usando o padrão. Array = o lojista reapontou.
      mappedPaths: override?.paths?.length ? override.paths : null,
      defaultValue: override?.defaultValue ?? null,
      resolved: resolved
        ? { value: resolved.value ?? null, matchedPath: resolved.matchedPath ?? null, source: resolved.source }
        : null,
    };
  });

  return NextResponse.json({
    triggerType: triggerType || null,
    sampleEventAt: sampleAt,
    hasSample: Boolean(sampleEvent),
    eventTags,
    platformTags: PLATFORM_TAGS.map((s) => ({
      tag: s.tag,
      label: s.label,
      group: s.group,
      groupLabel: TAG_GROUP_LABELS[s.group],
      description: s.description ?? null,
      sample: s.sample,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await req.json().catch(() => ({}));
  const tag = String(body?.tag || '').trim();
  if (!tag || !CATALOG_BY_TAG.has(tag)) {
    return NextResponse.json({ error: 'Variável desconhecida' }, { status: 400 });
  }
  const spec = CATALOG_BY_TAG.get(tag)!;
  if (spec.family !== 'event') {
    return NextResponse.json(
      { error: 'Só variáveis de evento têm caminho configurável. As de plataforma vêm das configurações da loja.' },
      { status: 400 }
    );
  }

  const paths: string[] = Array.isArray(body?.paths)
    ? body.paths.map((p: any) => String(p).trim()).filter(Boolean).slice(0, 10)
    : [];
  const defaultValue = body?.defaultValue ? String(body.defaultValue).slice(0, 500) : null;
  const storeId = body?.storeId ? String(body.storeId) : null;

  // Um caminho é uma sequência de chaves — nada de expressão. Recusar
  // aqui evita gravar algo que o resolvedor nunca encontraria.
  const invalido = paths.find((p) => !/^[A-Za-z0-9_.[\]]+$/.test(p));
  if (invalido) {
    return NextResponse.json(
      { error: `Caminho inválido: "${invalido}". Use apenas letras, números, ponto e colchetes.` },
      { status: 400 }
    );
  }

  if (storeId) {
    const { data: loja } = await supabaseAdmin
      .from('shopify_stores').select('id').eq('id', storeId).eq('organization_id', orgId).maybeSingle();
    if (!loja) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
  }

  // Sem caminho e sem valor padrão não há o que sobrescrever: some com
  // a linha para a variável voltar ao padrão do catálogo.
  if (paths.length === 0 && !defaultValue) {
    let del = supabaseAdmin.from('merge_tag_mappings').delete()
      .eq('organization_id', orgId).eq('tag', tag);
    del = storeId ? del.eq('store_id', storeId) : del.is('store_id', null);
    await del;
    return NextResponse.json({ tag, mappedPaths: null, defaultValue: null, reset: true });
  }

  const { error } = await supabaseAdmin
    .from('merge_tag_mappings')
    .upsert(
      {
        organization_id: orgId,
        store_id: storeId,
        tag,
        paths,
        default_value: defaultValue,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: storeId ? 'organization_id,store_id,tag' : 'organization_id,tag' }
    );

  if (error) {
    console.error('[merge-tags/mapping] upsert falhou:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag, mappedPaths: paths, defaultValue });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const tag = req.nextUrl.searchParams.get('tag');
  const storeId = req.nextUrl.searchParams.get('storeId');
  if (!tag) return NextResponse.json({ error: 'tag obrigatória' }, { status: 400 });

  let del = supabaseAdmin.from('merge_tag_mappings').delete()
    .eq('organization_id', orgId).eq('tag', tag);
  del = storeId ? del.eq('store_id', storeId) : del.is('store_id', null);
  const { error } = await del;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tag, reset: true });
}
