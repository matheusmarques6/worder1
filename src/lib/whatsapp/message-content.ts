/**
 * Extrai texto de mensagem WhatsApp pra renderização.
 *
 * Cloud API salva `content` como JSONB aninhado — ex texto: { text: { body: 'oi' } },
 * imagem: { image: { id, caption } }, etc. Evolution salva content como string direta.
 *
 * Renderizar `content` direto no JSX crasha com React error #31 (object as child).
 * Use este helper em qualquer lugar que precise do texto pra exibir.
 */
export function extractMessageText(
  content: any,
  fallbackTextBody?: string | null,
): string {
  if (typeof content === 'string') return content
  if (typeof content?.text === 'string') return content.text
  if (typeof content?.text?.body === 'string') return content.text.body
  if (typeof content?.body === 'string') return content.body
  if (typeof fallbackTextBody === 'string') return fallbackTextBody
  if (content?.image)    return content.image?.caption || '[Imagem]'
  if (content?.video)    return content.video?.caption || '[Vídeo]'
  if (content?.audio)    return '[Áudio]'
  if (content?.document) return content.document?.filename || '[Documento]'
  if (content?.sticker)  return '[Sticker]'
  if (content?.location) return '[Localização]'
  if (content?.contacts) return '[Contato]'
  if (content?.interactive) return content.interactive?.body?.text || '[Interativo]'
  if (content?.button)   return content.button?.text || '[Botão]'
  if (content?.reaction) return content.reaction?.emoji || '[Reação]'
  return ''
}
