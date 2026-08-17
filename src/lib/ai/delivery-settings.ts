/**
 * Entrega por loja (Pacote B 17/08): o webhook precisa do DEBOUNCE da org
 * (janela de agrupamento de rajada) a cada inbound — o valor mora em
 * ai_agents.settings.delivery, editado na órbita (Adaptação → Entrega).
 *
 * Mesma disciplina do runtime-rollout: cache por org com TTL curto e
 * fail-safe para o DEFAULT — erro de leitura jamais muda o comportamento
 * do webhook, e um valor recém-salvo vale em até 30s.
 */

import {
  DELIVERY_DEBOUNCE_DEFAULT,
  sanitizeDelivery,
} from '@/lib/ai/agent-hub';

const TTL_MS = 30_000;

const cache = new Map<string, { seconds: number; at: number }>();

export function clearDeliveryCache(): void {
  cache.clear();
}

type MinimalSupabase = {
  from: (table: string) => any;
};

export async function getDeliveryDebounceSeconds(
  supabase: MinimalSupabase,
  organizationId: string,
  now: () => number = Date.now,
): Promise<number> {
  const hit = cache.get(organizationId);
  if (hit && now() - hit.at < TTL_MS) return hit.seconds;

  try {
    const { data, error } = await supabase
      .from('ai_agents')
      .select('settings')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Não cacheia o erro: a próxima leitura tenta de novo.
      return hit?.seconds ?? DELIVERY_DEBOUNCE_DEFAULT;
    }

    const seconds = sanitizeDelivery(data?.settings?.delivery).debounce_seconds;
    cache.set(organizationId, { seconds, at: now() });
    return seconds;
  } catch {
    return hit?.seconds ?? DELIVERY_DEBOUNCE_DEFAULT;
  }
}
