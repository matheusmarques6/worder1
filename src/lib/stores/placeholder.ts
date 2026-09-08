// =============================================================
// O que é lápide e o que é loja de verdade
//
// Linhas com domínio .worder.local nascem de dois lugares MUITO
// diferentes, e tratá-las como uma coisa só escondia do usuário a
// loja que ele acabou de criar:
//
//   archived-<uuid>.worder.local  — lápide. A loja foi mesclada ou
//     arquivada; a linha só sobrevive para as chaves estrangeiras
//     antigas continuarem resolvendo. Sempre is_active = false.
//
//   manual-<slug>-<ts>.worder.local — loja REAL, criada pelo usuário
//     em "Adicionar loja", que ainda não tem integração Shopify. O
//     domínio é sintético só porque shop_domain é único e ainda não
//     existe domínio verdadeiro. Fica is_active = true, status
//     'pending', e PRECISA aparecer no switcher — senão quem escolhe
//     "configurar integração depois" cria uma loja invisível.
//
// A regra que separa as duas é uma só: lápide é a que está inativa.
// Ela mora aqui para os três endpoints que alimentam o switcher não
// divergirem de novo.
// =============================================================

export interface StoreRowLike {
  shop_domain?: string | null;
  is_active?: boolean | null;
}

const PLACEHOLDER_TLD = '.worder.local';

/** A loja ainda não tem domínio Shopify de verdade. */
export function hasPlaceholderDomain(store: StoreRowLike): boolean {
  return Boolean(store.shop_domain?.endsWith(PLACEHOLDER_TLD));
}

/**
 * Lápide: linha guardada só por integridade referencial, que nunca
 * deve aparecer para o usuário.
 */
export function isTombstoneStore(store: StoreRowLike): boolean {
  return hasPlaceholderDomain(store) && store.is_active === false;
}

/**
 * Loja criada pelo usuário que está esperando integração. Aparece no
 * switcher, com o rótulo "Sem integração".
 */
export function isAwaitingIntegration(store: StoreRowLike): boolean {
  return hasPlaceholderDomain(store) && store.is_active !== false;
}
