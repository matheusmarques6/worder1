// =====================================================
// PROCESSADOR DE TEXTO - CHUNKING
// =====================================================

import { TextChunk, ChunkOptions } from '../types'

// Aproximação de tokens por caractere (varia por idioma/conteúdo)
const CHARS_PER_TOKEN = 4

/**
 * Divide texto em chunks menores para indexação
 */
export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
  const {
    maxTokens = 500,
    overlap = 50,
    separator = '\n\n',
  } = options || {}

  const chunks: TextChunk[] = []
  const maxChars = maxTokens * CHARS_PER_TOKEN
  const overlapChars = overlap * CHARS_PER_TOKEN

  // Limpar texto
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!cleanText) {
    return []
  }

  // Se texto é pequeno o suficiente, retornar como único chunk
  if (cleanText.length <= maxChars) {
    return [{
      content: cleanText,
      tokens: estimateTokens(cleanText),
      index: 0,
      metadata: {},
    }]
  }

  // Dividir por separador primeiro
  const sections = cleanText.split(separator)
  let currentChunk = ''
  let chunkIndex = 0

  for (const section of sections) {
    const sectionWithSeparator = section + separator

    // Se adicionar essa seção excede o limite
    if (currentChunk.length + sectionWithSeparator.length > maxChars) {
      // Salvar chunk atual se não estiver vazio
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          tokens: estimateTokens(currentChunk),
          index: chunkIndex++,
          metadata: {},
        })
      }

      // Se a seção sozinha é muito grande, precisamos dividir por sentenças
      if (sectionWithSeparator.length > maxChars) {
        const subChunks = chunkLargeSection(section, maxChars, overlapChars, chunkIndex)
        chunks.push(...subChunks)
        chunkIndex += subChunks.length
        currentChunk = ''
      } else {
        // Começar novo chunk com overlap do anterior
        if (currentChunk.length > overlapChars) {
          const overlapText = currentChunk.slice(-overlapChars)
          currentChunk = overlapText + sectionWithSeparator
        } else {
          currentChunk = sectionWithSeparator
        }
      }
    } else {
      currentChunk += sectionWithSeparator
    }
  }

  // Adicionar último chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokens: estimateTokens(currentChunk),
      index: chunkIndex,
      metadata: {},
    })
  }

  return chunks
}

/**
 * Divide seções muito grandes em chunks menores
 */
function chunkLargeSection(
  section: string, 
  maxChars: number, 
  overlapChars: number,
  startIndex: number
): TextChunk[] {
  const chunks: TextChunk[] = []
  
  // Tentar dividir por sentenças
  const sentences = section.match(/[^.!?]+[.!?]+/g) || [section]
  let currentChunk = ''
  let chunkIndex = startIndex

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChars) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          tokens: estimateTokens(currentChunk),
          index: chunkIndex++,
          metadata: {},
        })
      }
      
      // Se uma sentença é muito grande, dividir por palavras
      if (sentence.length > maxChars) {
        const wordChunks = chunkByWords(sentence, maxChars, overlapChars, chunkIndex)
        chunks.push(...wordChunks)
        chunkIndex += wordChunks.length
        currentChunk = ''
      } else {
        currentChunk = sentence
      }
    } else {
      currentChunk += sentence
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokens: estimateTokens(currentChunk),
      index: chunkIndex,
      metadata: {},
    })
  }

  return chunks
}

/**
 * Divide por palavras (último recurso)
 */
function chunkByWords(
  text: string, 
  maxChars: number, 
  overlapChars: number,
  startIndex: number
): TextChunk[] {
  const chunks: TextChunk[] = []
  const words = text.split(/\s+/)
  let currentChunk = ''
  let chunkIndex = startIndex

  for (const word of words) {
    if (currentChunk.length + word.length + 1 > maxChars) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          tokens: estimateTokens(currentChunk),
          index: chunkIndex++,
          metadata: {},
        })
      }
      currentChunk = word + ' '
    } else {
      currentChunk += word + ' '
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokens: estimateTokens(currentChunk),
      index: chunkIndex,
      metadata: {},
    })
  }

  return chunks
}

/**
 * Estima número de tokens em um texto
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Limpa e normaliza texto para indexação
 */
export function cleanTextForIndexing(text: string): string {
  return text
    // Remover caracteres de controle
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    // Normalizar espaços
    .replace(/\s+/g, ' ')
    // Remover múltiplas quebras de linha
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim()
}

/**
 * Extrai metadados básicos do texto
 */
export function extractTextMetadata(text: string): Record<string, any> {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length
  const charCount = text.length
  const sentenceCount = (text.match(/[.!?]+/g) || []).length
  const paragraphCount = (text.match(/\n\n+/g) || []).length + 1

  return {
    word_count: wordCount,
    char_count: charCount,
    sentence_count: sentenceCount,
    paragraph_count: paragraphCount,
    estimated_tokens: estimateTokens(text),
  }
}
