// =============================================
// Splitter de mensagens — quando agent.persona.split_messages = true,
// quebra a resposta da IA em 2-3 mensagens curtas pra simular conversa
// natural no WhatsApp (em vez de um wall-of-text).
//
// Estratégia:
//   1. Se já tem parágrafos (\n\n), respeita a quebra.
//   2. Senão, agrupa sentenças até MAX_CHARS (~120-180 chars).
//   3. Hard cap: no máximo MAX_PARTS partes.
// =============================================

const MAX_CHARS_PER_PART = 220
const MAX_PARTS = 3

export function splitMessages(text: string, opts: { maxParts?: number; maxChars?: number } = {}): string[] {
  const maxParts = opts.maxParts ?? MAX_PARTS
  const maxChars = opts.maxChars ?? MAX_CHARS_PER_PART
  const trimmed = text.trim()
  if (!trimmed) return []

  // Caminho 1: já tem quebras de parágrafo
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length > 1 && paragraphs.length <= maxParts) {
    return paragraphs
  }
  if (paragraphs.length > maxParts) {
    // junta o restante na última parte
    const head = paragraphs.slice(0, maxParts - 1)
    const tail = paragraphs.slice(maxParts - 1).join('\n\n')
    return [...head, tail]
  }

  // Caminho 2: divide por sentenças
  const sentences = splitSentences(trimmed)
  if (sentences.length <= 1) return [trimmed]

  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (!current) {
      current = sentence
      continue
    }
    if (current.length + sentence.length + 1 <= maxChars) {
      current = `${current} ${sentence}`
    } else {
      parts.push(current)
      current = sentence
      if (parts.length === maxParts - 1) {
        // última parte recebe o restante
        const remainingIdx = sentences.indexOf(sentence)
        current = sentences.slice(remainingIdx).join(' ')
        break
      }
    }
  }
  if (current) parts.push(current)

  return parts.length > 0 ? parts : [trimmed]
}

function splitSentences(text: string): string[] {
  // Quebra em ., !, ? mantendo o terminador. Não quebra em abreviações comuns.
  return text
    .replace(/([.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, '$1')
    .split('')
    .map((s) => s.trim())
    .filter(Boolean)
}
