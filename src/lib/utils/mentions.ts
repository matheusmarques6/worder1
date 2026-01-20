/**
 * Utilitários para trabalhar com menções no formato @[Nome](userId)
 */

// Regex para encontrar menções no formato @[Nome](uuid)
const MENTION_REGEX = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g

/**
 * Extrai os IDs dos usuários mencionados de um texto
 * Formato esperado: @[Nome do Usuário](uuid-do-usuario)
 */
export function extractMentionIds(text: string): string[] {
  const ids: string[] = []
  let match

  // Reset do regex para garantir que começa do início
  const regex = new RegExp(MENTION_REGEX)
  
  while ((match = regex.exec(text)) !== null) {
    const userId = match[2]
    if (userId && !ids.includes(userId)) {
      ids.push(userId)
    }
  }

  return ids
}

/**
 * Extrai as menções completas (nome e ID) de um texto
 */
export function extractMentions(text: string): Array<{ name: string; id: string }> {
  const mentions: Array<{ name: string; id: string }> = []
  let match

  const regex = new RegExp(MENTION_REGEX)
  
  while ((match = regex.exec(text)) !== null) {
    const name = match[1]
    const id = match[2]
    if (id && !mentions.find(m => m.id === id)) {
      mentions.push({ name, id })
    }
  }

  return mentions
}

/**
 * Formata uma menção no padrão @[Nome](userId)
 */
export function formatMention(userId: string, name: string): string {
  return `@[${name}](${userId})`
}

/**
 * Remove as menções de um texto, deixando apenas o nome
 * @[João](123) -> @João
 */
export function stripMentionIds(text: string): string {
  return text.replace(MENTION_REGEX, '@$1')
}

/**
 * Verifica se um texto contém menções
 */
export function hasMentions(text: string): boolean {
  return MENTION_REGEX.test(text)
}

/**
 * Conta quantas menções existem em um texto
 */
export function countMentions(text: string): number {
  const matches = text.match(new RegExp(MENTION_REGEX))
  return matches ? matches.length : 0
}

/**
 * Verifica se um usuário específico foi mencionado
 */
export function isUserMentioned(text: string, userId: string): boolean {
  return extractMentionIds(text).includes(userId)
}

/**
 * Converte texto com menções para HTML (para exibição)
 */
export function mentionsToHtml(text: string): string {
  return text.replace(
    MENTION_REGEX,
    '<span class="mention bg-blue-100 text-blue-700 px-1 rounded">@$1</span>'
  )
}
