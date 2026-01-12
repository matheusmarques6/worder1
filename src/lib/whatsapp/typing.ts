// =====================================================
// TYPING INDICATOR - EVOLUTION API
// Mostra "digitando..." antes de enviar mensagem
// Faz a IA parecer mais humana
// =====================================================

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

// =====================================================
// CONFIGURAÇÕES
// =====================================================

export const TYPING_CONFIG = {
  // Velocidade de digitação (caracteres por segundo)
  CHARS_PER_SECOND: 40,
  
  // Tempo mínimo de digitação (ms)
  MIN_TYPING_TIME: 1500,
  
  // Tempo máximo de digitação (ms)
  MAX_TYPING_TIME: 5000,
  
  // Tempo de "leitura" da mensagem antes de começar a digitar (ms)
  READING_TIME_PER_WORD: 100,
  
  // Máximo tempo de leitura (ms)
  MAX_READING_TIME: 2000,
}

// =====================================================
// ENVIAR TYPING INDICATOR
// =====================================================

/**
 * Envia indicador de "digitando..." para o WhatsApp
 * @param instanceName - Nome da instância Evolution
 * @param phone - Número do telefone
 * @param durationMs - Duração em milissegundos
 */
export async function sendTypingIndicator(
  instanceName: string,
  phone: string,
  durationMs: number = 3000
): Promise<boolean> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.warn('[Typing] ⚠️ Evolution API não configurada')
    return false
  }

  try {
    const formattedPhone = phone.replace(/\D/g, '')

    const response = await fetch(`${EVOLUTION_API_URL}/chat/presence/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: formattedPhone,
        delay: durationMs,
        presence: 'composing',
      }),
    })

    if (!response.ok) {
      console.warn('[Typing] ⚠️ Erro ao enviar:', response.status)
      return false
    }

    console.log(`[Typing] ⌨️ Digitando... ${formattedPhone} (${durationMs}ms)`)
    return true

  } catch (error) {
    console.warn('[Typing] ⚠️ Erro ao enviar indicador:', error)
    return false
  }
}

// =====================================================
// ENVIAR INDICADOR DE GRAVANDO ÁUDIO
// =====================================================

/**
 * Envia indicador de "gravando áudio..." para o WhatsApp
 * Útil para respostas em áudio
 */
export async function sendRecordingIndicator(
  instanceName: string,
  phone: string,
  durationMs: number = 3000
): Promise<boolean> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return false
  }

  try {
    const formattedPhone = phone.replace(/\D/g, '')

    const response = await fetch(`${EVOLUTION_API_URL}/chat/presence/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: formattedPhone,
        delay: durationMs,
        presence: 'recording',
      }),
    })

    if (!response.ok) {
      return false
    }

    console.log(`[Typing] 🎤 Gravando... ${formattedPhone} (${durationMs}ms)`)
    return true

  } catch (error) {
    return false
  }
}

// =====================================================
// PARAR TYPING (FICAR ONLINE)
// =====================================================

/**
 * Para o indicador de digitação e mostra como "online"
 */
export async function sendOnlinePresence(
  instanceName: string,
  phone: string
): Promise<boolean> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return false
  }

  try {
    const formattedPhone = phone.replace(/\D/g, '')

    const response = await fetch(`${EVOLUTION_API_URL}/chat/presence/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: formattedPhone,
        presence: 'available',
      }),
    })

    return response.ok

  } catch (error) {
    return false
  }
}

// =====================================================
// CALCULAR TEMPO DE DIGITAÇÃO
// =====================================================

/**
 * Calcula tempo de digitação baseado no tamanho da mensagem
 * Simula um humano digitando naturalmente
 */
export function calculateTypingTime(message: string): number {
  const { CHARS_PER_SECOND, MIN_TYPING_TIME, MAX_TYPING_TIME } = TYPING_CONFIG
  
  const calculatedTime = (message.length / CHARS_PER_SECOND) * 1000
  
  return Math.min(Math.max(calculatedTime, MIN_TYPING_TIME), MAX_TYPING_TIME)
}

/**
 * Calcula tempo de "leitura" da mensagem do usuário
 * Antes de começar a digitar, a IA "lê" a mensagem
 */
export function calculateReadingTime(message: string): number {
  const { READING_TIME_PER_WORD, MAX_READING_TIME } = TYPING_CONFIG
  
  const wordCount = message.split(/\s+/).length
  const calculatedTime = wordCount * READING_TIME_PER_WORD
  
  return Math.min(calculatedTime, MAX_READING_TIME)
}

/**
 * Calcula tempo total de resposta (leitura + digitação)
 */
export function calculateTotalResponseTime(
  userMessage: string, 
  aiResponse: string
): { readingTime: number; typingTime: number; totalTime: number } {
  const readingTime = calculateReadingTime(userMessage)
  const typingTime = calculateTypingTime(aiResponse)
  
  return {
    readingTime,
    typingTime,
    totalTime: readingTime + typingTime,
  }
}

// =====================================================
// SIMULAR RESPOSTA HUMANA COMPLETA
// =====================================================

/**
 * Simula comportamento humano completo:
 * 1. "Lê" a mensagem (pausa)
 * 2. Mostra "digitando..."
 * 3. "Digita" a resposta (pausa proporcional)
 * 4. Retorna para enviar a mensagem
 */
export async function simulateHumanResponse(
  instanceName: string,
  phone: string,
  userMessage: string,
  aiResponse: string,
  options?: {
    skipReading?: boolean
    minDelay?: number
    maxDelay?: number
  }
): Promise<void> {
  const { skipReading = false, minDelay = 1000, maxDelay = 6000 } = options || {}

  // 1. Tempo de leitura (simula ler a mensagem do usuário)
  if (!skipReading) {
    const readingTime = calculateReadingTime(userMessage)
    if (readingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, readingTime))
    }
  }

  // 2. Calcular tempo de digitação
  let typingTime = calculateTypingTime(aiResponse)
  
  // Aplicar limites personalizados
  typingTime = Math.max(minDelay, Math.min(typingTime, maxDelay))

  // 3. Enviar typing indicator
  await sendTypingIndicator(instanceName, phone, typingTime)

  // 4. Aguardar tempo de "digitação"
  await new Promise(resolve => setTimeout(resolve, typingTime))
}

// =====================================================
// TYPING COM MÚLTIPLAS MENSAGENS
// =====================================================

/**
 * Para respostas longas que serão divididas em múltiplas mensagens
 */
export async function simulateTypingForMultipleMessages(
  instanceName: string,
  phone: string,
  messages: string[]
): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const typingTime = calculateTypingTime(message)

    await sendTypingIndicator(instanceName, phone, typingTime)
    await new Promise(resolve => setTimeout(resolve, typingTime))

    // Pequena pausa entre mensagens (como se estivesse pensando)
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
}

// =====================================================
// HELPERS EXPORTADOS
// =====================================================

/**
 * Aguarda com typing indicator
 */
export async function waitWithTyping(
  instanceName: string,
  phone: string,
  durationMs: number
): Promise<void> {
  await sendTypingIndicator(instanceName, phone, durationMs)
  await new Promise(resolve => setTimeout(resolve, durationMs))
}

/**
 * Delay simples (sem typing)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
