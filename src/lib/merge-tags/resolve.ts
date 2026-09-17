// =============================================================
// Resolver uma variável de evento — com mapeamento configurável
//
// O nome da variável é estável ({{ CheckoutURL }}); o caminho até o
// valor não. Cada integração manda o link do checkout num campo
// diferente, e antes a única saída era editar o resolvedor no código.
//
// Agora a cascata de caminhos do catálogo é apenas o PADRÃO. Em
// Integrações → Mapeamento de variáveis o lojista aponta a variável
// para outro caminho do payload, e os templates continuam iguais.
// É o mesmo desenho do mapeamento de campos da Klaviyo.
//
// Ordem de resolução, do mais específico para o mais genérico:
//   1. caminhos do mapeamento da organização (se houver)
//   2. cascata padrão do catálogo
//   3. valor padrão configurado
// =============================================================

import { CATALOG_BY_TAG, toDotPath, type CatalogTag } from './catalog';

export interface TagMappingOverride {
  /** Nome da variável do catálogo, ex.: 'CheckoutURL'. */
  tag: string;
  /** Cascata que substitui a padrão. Vazia = usa a padrão. */
  paths: string[];
  /** Usado quando nenhum caminho resolve. */
  defaultValue?: string | null;
}

export type TagMappingIndex = Map<string, TagMappingOverride>;

export function buildMappingIndex(overrides: TagMappingOverride[] | null | undefined): TagMappingIndex {
  const idx: TagMappingIndex = new Map();
  for (const o of overrides || []) {
    if (o?.tag) idx.set(o.tag, o);
  }
  return idx;
}

/**
 * Lê um caminho pontilhado dentro de um objeto. `Items.0.ProductName`
 * atravessa arrays por índice numérico.
 *
 * A segunda passada é insensível a maiúsculas de propósito: payloads
 * legados dizem `OrderId` onde o catálogo diz `OrderID`, e recusar por
 * causa de uma letra deixaria a variável vazia sem explicação.
 */
function readPath(root: any, dotted: string): any {
  if (root === null || root === undefined) return undefined;
  const segments = toDotPath(dotted).split('.').filter(Boolean);

  let cur: any = root;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[seg];
  }
  if (cur !== undefined && cur !== null) return cur;

  cur = root;
  for (const seg of segments) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    let next = cur[seg];
    if (next === undefined) {
      const lower = seg.toLowerCase();
      const key = Object.keys(cur).find((k) => k.toLowerCase() === lower);
      if (key !== undefined) next = cur[key];
    }
    cur = next;
  }
  return cur;
}

/**
 * Transforma o valor bruto no texto que chega ao cliente.
 *
 *   ['CUPOM10']                → 'CUPOM10'
 *   [{ code: 'CUPOM10' }]      → 'CUPOM10'   (formato Shopify)
 *   objeto / array complexo    → undefined (conta como não encontrado)
 */
export function normalizeValue(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== null && v !== undefined);
    if (items.length === 0) return undefined;
    if (items.every((v) => typeof v !== 'object')) return items.map(String).join(', ');
    if (items.every((v) => typeof (v as any).code === 'string')) {
      return items.map((v) => String((v as any).code)).join(', ');
    }
    return undefined;
  }
  if (typeof value === 'object') return undefined;
  const s = String(value);
  return s.length > 0 ? s : undefined;
}

export interface ResolveResult {
  value?: string;
  /** Qual caminho resolveu — a tela de mapeamento mostra isso. */
  matchedPath?: string;
  /** De onde veio: o mapeamento do lojista ou a cascata padrão. */
  source: 'mapping' | 'catalog' | 'default' | 'miss';
}

/**
 * Os três lugares onde um valor pode estar num evento. Um mesmo campo
 * chega ora na raiz, ora em properties, ora em properties.raw,
 * dependendo de quem produziu o evento — procurar nos três é o que faz
 * a variável funcionar "independente da integração".
 */
function payloadRoots(eventData: any): any[] {
  const ev = eventData || {};
  const props = ev.properties || ev;
  const raw = props.raw || ev.raw || {};
  return [ev, props, raw];
}

/** Resolve uma variável de evento contra um payload. */
export function resolveEventTag(
  tag: string,
  eventData: any,
  mapping?: TagMappingIndex
): ResolveResult {
  const spec = CATALOG_BY_TAG.get(tag);
  const override = mapping?.get(tag);

  // O mapeamento do lojista vem primeiro e por inteiro: se ele apontou
  // a variável para um caminho, é porque a cascata padrão não servia.
  const chains: Array<{ paths: string[]; source: 'mapping' | 'catalog' }> = [];
  if (override?.paths?.length) chains.push({ paths: override.paths, source: 'mapping' });
  if (spec?.paths?.length) chains.push({ paths: spec.paths, source: 'catalog' });

  const roots = payloadRoots(eventData);
  for (const chain of chains) {
    for (const path of chain.paths) {
      for (const root of roots) {
        const normalized = normalizeValue(readPath(root, path));
        if (normalized !== undefined) {
          return { value: normalized, matchedPath: path, source: chain.source };
        }
      }
    }
  }

  const fallback = override?.defaultValue;
  if (fallback) return { value: fallback, source: 'default' };
  return { source: 'miss' };
}

/**
 * Todas as variáveis de evento resolvidas de uma vez, para um payload.
 * Usado pela tela de mapeamento (mostrar o que cada uma daria com um
 * evento real) e pela pré-visualização.
 */
export function resolveAllEventTags(
  specs: CatalogTag[],
  eventData: any,
  mapping?: TagMappingIndex
): Record<string, ResolveResult> {
  const out: Record<string, ResolveResult> = {};
  for (const s of specs) out[s.tag] = resolveEventTag(s.tag, eventData, mapping);
  return out;
}
