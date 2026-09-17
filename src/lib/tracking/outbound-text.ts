// =============================================================
// UTM + identificação nos links de mensagens de TEXTO (SMS / WhatsApp).
//
// Mesma regra do e-mail: todo link sai completo, com a configuração da
// loja do envio. Aqui não há rastreador de clique no meio, então os
// parâmetros vão direto no destino — o pixel da loja lê worderContactID
// / worderSendID na chegada e amarra o visitante ao contato.
// =============================================================

import { getUtmSettings } from '@/lib/tracking/utm-settings';
import {
  makeLinkParamsResolver,
  stampTextLinks,
  type LinkChannel,
  type LinkContext,
} from '@/lib/tracking/link-params';

export interface StampMessageLinksInput {
  text: string;
  organizationId: string | null | undefined;
  storeId?: string | null;
  channel: LinkChannel;
  context: Omit<LinkContext, 'channel'>;
}

/**
 * Carimba as URLs de um texto. Nunca lança: qualquer falha devolve o
 * texto original para o envio seguir.
 */
export async function stampMessageLinks(input: StampMessageLinksInput): Promise<string> {
  const { text } = input;
  if (!text || !/https?:\/\//i.test(text)) return text;
  try {
    const { settings } = await getUtmSettings(input.organizationId, input.storeId || null);
    const resolve = makeLinkParamsResolver(settings, {
      ...input.context,
      channel: input.channel,
      sentAt: input.context.sentAt || new Date(),
    });
    return stampTextLinks(text, resolve);
  } catch (e) {
    console.warn('[outbound-text] falha ao carimbar links, texto segue original:', (e as Error)?.message);
    return text;
  }
}
