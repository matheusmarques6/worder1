// =============================================
// Termo de busca que continua sendo busca.
//
// O PostgREST recebe filtros como TEXTO na query string:
//
//   or=(email.ilike.%ana%,phone.ilike.%ana%)
//
// Quando o termo do lojista entra ali por interpolação, vírgula e
// parêntese deixam de ser letras e passam a ser gramática: uma busca por
// "silva, joão" vira duas condições, e um ")" fecha a lista e o que vem
// depois é lido como filtro. Não é injeção de SQL — o PostgREST não
// monta SQL a partir disso —, mas é o cliente reescrevendo a consulta do
// servidor, o que já é motivo suficiente.
//
// O `%` e o `_` são curingas do LIKE: deixá-los passar transforma
// "100%" numa busca por "100" seguido de qualquer coisa. Quem digita
// "100%" quer o texto, não o curinga.
//
// A regra é a mesma em todo lugar: sai o que é gramática, fica o que é
// texto, com um teto de tamanho para não mandar um romance ao banco.
// =============================================

/** Caracteres com significado no filtro do PostgREST ou no LIKE. */
const GRAMATICA = /[,()%_\\*'"]/g

export const MAX_SEARCH_LENGTH = 100

/**
 * Devolve o termo pronto para ir dentro de um filtro. String vazia quer
 * dizer "não filtre" — quem chama deve tratar isso, e não buscar por "".
 */
export function sanitizeSearchTerm(raw: unknown, maxLength: number = MAX_SEARCH_LENGTH): string {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .replace(GRAMATICA, ' ')
    // Espaço em excesso não muda o resultado e polui o log.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, maxLength))
    .trim()
}

/** O termo já cercado de `%`, para usar em `ilike`. Vazio = não filtre. */
export function likePattern(raw: unknown, maxLength: number = MAX_SEARCH_LENGTH): string {
  const termo = sanitizeSearchTerm(raw, maxLength)
  return termo ? `%${termo}%` : ''
}
