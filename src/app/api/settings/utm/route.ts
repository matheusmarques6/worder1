// =============================================
// GET/PATCH /api/settings/utm
//
// Rastreamento de links (UTM + identificação) — modelo Omnisend/Klaviyo.
// Configuração POR LOJA (shopify_stores.settings.utm_settings); sem loja,
// edita o padrão da organização (organizations.email_settings.utm_settings),
// que só vale para lojas sem configuração própria.
//
//   GET   ?storeId=…        → { settings, source, defaults, variables, identification }
//   PATCH { storeId?, settings } → salva (validado e normalizado)
//   PATCH { storeId, reset: true } → loja volta a herdar o padrão
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  DEFAULT_UTM_SETTINGS,
  IDENT_PARAM_KEYS,
  MAX_CUSTOM_PARAMS,
  MAX_UTM_VALUE_LENGTH,
  UTM_KEYS,
  UTM_VARIABLES,
  isValidCustomParamKey,
  normalizeUtmSettings,
} from '@/lib/tracking/link-params';
import {
  clearStoreUtmSettings,
  getUtmSettings,
  saveOrgUtmSettings,
  saveStoreUtmSettings,
} from '@/lib/tracking/utm-settings';

export const dynamic = 'force-dynamic';

async function loadStore(orgId: string, storeId: string) {
  const { data } = await supabaseAdmin
    .from('shopify_stores')
    .select('id, organization_id, shop_name')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data as { id: string; organization_id: string; shop_name: string | null } | null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const storeId = request.nextUrl.searchParams.get('storeId');

  let store: { id: string; shop_name: string | null } | null = null;
  if (storeId) {
    store = await loadStore(orgId, storeId);
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const resolved = await getUtmSettings(orgId, store?.id || null);
  return NextResponse.json({
    settings: resolved.settings,
    source: resolved.source,
    defaults: DEFAULT_UTM_SETTINGS,
    variables: UTM_VARIABLES,
    identification: IDENT_PARAM_KEYS,
    limits: { maxValueLength: MAX_UTM_VALUE_LENGTH, maxCustomParams: MAX_CUSTOM_PARAMS },
    store: store ? { id: store.id, name: store.shop_name } : null,
  });
}

/** Erros de validação legíveis para a UI (antes da normalização silenciosa). */
function validate(raw: any): string | null {
  if (!raw || typeof raw !== 'object') return 'Configuração inválida.';
  for (const scope of ['campaign', 'automation'] as const) {
    const t = raw[scope];
    if (t === undefined) continue;
    if (!t || typeof t !== 'object') return `Bloco "${scope}" inválido.`;
    for (const key of UTM_KEYS) {
      const v = t[key];
      if (v === undefined) continue;
      if (typeof v !== 'string') return `${key} precisa ser texto.`;
      if (v.length > MAX_UTM_VALUE_LENGTH) return `${key} passa de ${MAX_UTM_VALUE_LENGTH} caracteres.`;
    }
  }
  if (raw.custom !== undefined) {
    if (!Array.isArray(raw.custom)) return 'Parâmetros personalizados inválidos.';
    if (raw.custom.length > MAX_CUSTOM_PARAMS) return `No máximo ${MAX_CUSTOM_PARAMS} parâmetros personalizados.`;
    const seen = new Set<string>();
    for (const item of raw.custom) {
      const key = String(item?.key ?? '').trim();
      if (!isValidCustomParamKey(key)) {
        return `Nome de parâmetro inválido: "${key}". Use letras, números, _ ou -, sem começar com "worder" nem repetir uma UTM padrão.`;
      }
      if (seen.has(key.toLowerCase())) return `Parâmetro repetido: "${key}".`;
      seen.add(key.toLowerCase());
    }
  }
  return null;
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const storeId: string | null = body?.storeId || null;
  let store: { id: string; shop_name: string | null } | null = null;
  if (storeId) {
    store = await loadStore(orgId, storeId);
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  if (body?.reset === true) {
    if (!store) return NextResponse.json({ error: 'reset exige storeId' }, { status: 400 });
    const { error } = await clearStoreUtmSettings(store.id);
    if (error) return NextResponse.json({ error }, { status: 500 });
    const resolved = await getUtmSettings(orgId, store.id);
    return NextResponse.json({ settings: resolved.settings, source: resolved.source });
  }

  const problem = validate(body?.settings);
  if (problem) return NextResponse.json({ error: problem, code: 'invalid_settings' }, { status: 400 });

  const settings = normalizeUtmSettings(body.settings);
  const { error } = store
    ? await saveStoreUtmSettings(store.id, settings)
    : await saveOrgUtmSettings(orgId, settings);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ settings, source: store ? 'store' : 'org' });
}
