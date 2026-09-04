// =============================================================
// Carrega o mapeamento de variáveis da organização (lado servidor)
//
// Cache de 60s por (org, loja): uma campanha de 20 mil contatos chama o
// resolvedor uma vez por e-mail, e sem cache seriam 20 mil consultas
// para ler a mesma meia dúzia de linhas.
// =============================================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildMappingIndex, type TagMappingIndex, type TagMappingOverride } from './resolve';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { index: TagMappingIndex; ts: number }>();

/** Só para os testes. */
export function __clearMappingCache() {
  cache.clear();
}

export async function loadTagMapping(
  organizationId: string | null | undefined,
  storeId?: string | null
): Promise<TagMappingIndex | undefined> {
  if (!organizationId) return undefined;
  const key = `${organizationId}:${storeId || '-'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.index;

  try {
    const { data, error } = await supabaseAdmin
      .from('merge_tag_mappings')
      .select('tag, paths, default_value, store_id')
      .eq('organization_id', organizationId);
    if (error) throw error;

    const rows = (data || []) as any[];
    // O escopo de loja vem depois para sobrescrever o da organização
    // quando as duas linhas existem para a mesma variável.
    const ordenado: TagMappingOverride[] = [
      ...rows.filter((r) => !r.store_id),
      ...(storeId ? rows.filter((r) => r.store_id === storeId) : []),
    ].map((r) => ({ tag: r.tag, paths: r.paths || [], defaultValue: r.default_value }));

    const index = buildMappingIndex(ordenado);
    cache.set(key, { index, ts: Date.now() });
    return index;
  } catch (err) {
    // Sem mapeamento a cascata padrão continua valendo: nunca vale a
    // pena derrubar um envio por causa de uma configuração opcional.
    console.error('[merge-tags] falha ao carregar mapeamento:', err);
    return undefined;
  }
}
