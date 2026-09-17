// =============================================================
// Onde mora a configuração de UTM e como ela é resolvida por envio.
//
//   shopify_stores.settings.utm_settings          ← a loja (prioridade)
//   organizations.email_settings.utm_settings     ← padrão da organização
//   organizations.email_settings.utm_source/…     ← legado da página antiga
//   DEFAULT_UTM_SETTINGS                          ← padrão Worder
//
// Multi-tenant: a loja do envio decide. A organização só entra quando a
// loja nunca configurou nada (ou o envio não tem loja).
// =============================================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  DEFAULT_UTM_SETTINGS,
  normalizeUtmSettings,
  utmSettingsFromLegacy,
  type UtmSettings,
} from '@/lib/tracking/link-params';

export type UtmSettingsSource = 'store' | 'org' | 'legacy' | 'default';

export interface ResolvedUtmSettings {
  settings: UtmSettings;
  source: UtmSettingsSource;
}

const cache = new Map<string, { value: ResolvedUtmSettings; ts: number }>();
const CACHE_TTL_MS = 60_000;

export function __resetUtmSettingsCache() {
  cache.clear();
}

function hasOwnConfig(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && Object.keys(raw as object).length > 0;
}

export async function getUtmSettings(
  organizationId: string | null | undefined,
  storeId?: string | null,
  client: any = supabaseAdmin
): Promise<ResolvedUtmSettings> {
  const key = `${organizationId || ''}::${storeId || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value;

  let resolved: ResolvedUtmSettings = { settings: DEFAULT_UTM_SETTINGS, source: 'default' };
  try {
    if (storeId) {
      const { data: store } = await client
        .from('shopify_stores')
        .select('settings')
        .eq('id', storeId)
        .maybeSingle();
      const raw = (store?.settings as any)?.utm_settings;
      if (hasOwnConfig(raw)) {
        resolved = { settings: normalizeUtmSettings(raw), source: 'store' };
      }
    }
    if (resolved.source === 'default' && organizationId) {
      const { data: org } = await client
        .from('organizations')
        .select('email_settings')
        .eq('id', organizationId)
        .maybeSingle();
      const emailSettings = (org?.email_settings as any) || {};
      if (hasOwnConfig(emailSettings.utm_settings)) {
        resolved = { settings: normalizeUtmSettings(emailSettings.utm_settings), source: 'org' };
      } else {
        const legacy = utmSettingsFromLegacy(emailSettings);
        if (legacy) resolved = { settings: legacy, source: 'legacy' };
      }
    }
  } catch (e) {
    console.warn('[utm-settings] falha ao carregar configuração, usando padrão:', (e as Error)?.message);
  }

  cache.set(key, { value: resolved, ts: Date.now() });
  return resolved;
}

/** Grava a configuração da loja (merge no jsonb `settings`). */
export async function saveStoreUtmSettings(
  storeId: string,
  settings: UtmSettings,
  client: any = supabaseAdmin
): Promise<{ error: string | null }> {
  const { data: store, error: readErr } = await client
    .from('shopify_stores')
    .select('id, organization_id, settings')
    .eq('id', storeId)
    .maybeSingle();
  if (readErr || !store) return { error: readErr?.message || 'store_not_found' };
  const next = { ...((store.settings as any) || {}), utm_settings: settings };
  const { error } = await client
    .from('shopify_stores')
    .update({ settings: next, updated_at: new Date().toISOString() })
    .eq('id', storeId);
  cache.delete(`${store.organization_id || ''}::${storeId}`);
  return { error: error?.message || null };
}

/** Remove a configuração própria da loja — ela volta a herdar o padrão. */
export async function clearStoreUtmSettings(
  storeId: string,
  client: any = supabaseAdmin
): Promise<{ error: string | null }> {
  const { data: store, error: readErr } = await client
    .from('shopify_stores')
    .select('id, organization_id, settings')
    .eq('id', storeId)
    .maybeSingle();
  if (readErr || !store) return { error: readErr?.message || 'store_not_found' };
  const next = { ...((store.settings as any) || {}) };
  delete next.utm_settings;
  const { error } = await client
    .from('shopify_stores')
    .update({ settings: next, updated_at: new Date().toISOString() })
    .eq('id', storeId);
  cache.delete(`${store.organization_id || ''}::${storeId}`);
  return { error: error?.message || null };
}

/** Grava o padrão da organização (merge em `email_settings`). */
export async function saveOrgUtmSettings(
  organizationId: string,
  settings: UtmSettings,
  client: any = supabaseAdmin
): Promise<{ error: string | null }> {
  const { data: org, error: readErr } = await client
    .from('organizations')
    .select('id, email_settings')
    .eq('id', organizationId)
    .maybeSingle();
  if (readErr || !org) return { error: readErr?.message || 'org_not_found' };
  const next = { ...((org.email_settings as any) || {}), utm_settings: settings };
  const { error } = await client
    .from('organizations')
    .update({ email_settings: next, updated_at: new Date().toISOString() })
    .eq('id', organizationId);
  // O padrão da organização vale para qualquer loja sem configuração própria.
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${organizationId}::`)) cache.delete(k);
  }
  return { error: error?.message || null };
}
