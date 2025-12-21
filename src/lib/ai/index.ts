// =====================================================
// LIB/AI - EXPORTS
// Sistema de Agentes de IA
// =====================================================

// Types
export * from './types'

// Engine
export { AIAgentEngine, createAgentEngine, processWithAgent } from './engine'

// RAG
export { RAGService, createRAGService, ragSearch } from './rag'

// Actions
export { ActionsEngine, createActionsEngine } from './actions-engine'

// Prompt Builder
export { PromptBuilder, createPromptBuilder, formatRAGAsContext } from './prompt-builder'

// Embeddings
export {
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from './embeddings'

// Intent Detection
export { detectIntent, detectIntentSimple } from './intent-detector'

// Sentiment Analysis
export { analyzeSentiment, analyzeSentimentSimple, matchesSentiment } from './sentiment-analyzer'

// WhatsApp Integration
export { processWhatsAppWithAgent, handleIncomingWhatsAppMessage } from './whatsapp-integration'

// Processors
export { chunkText, estimateTokens, cleanTextForIndexing, extractTextMetadata } from './processors/text-processor'
