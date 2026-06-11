import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'
import { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Module-level lazy client
let _supabase: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient()
    if (!_supabase) throw new Error('Database not configured')
  }
  return _supabase
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop]
  }
})

// =========================================================
// OpenRouter live catalog
// =========================================================
// O catalogo do OpenRouter tem ~300 modelos e muda toda semana. Hardcode
// fica obsoleto rapido. /v1/models e publico (nao precisa de chave) e o
// fetch dura ~200ms, entao cacheamos em memoria por 1h pra evitar bater
// toda vez que algum agente abre o seletor.

type OpenRouterModel = {
  id: string
  name?: string
  description?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
}

let _openRouterCache: { models: any[]; fetchedAt: number } | null = null
const OPENROUTER_TTL_MS = 60 * 60 * 1000 // 1h

async function fetchOpenRouterCatalog(): Promise<any[]> {
  const now = Date.now()
  if (_openRouterCache && now - _openRouterCache.fetchedAt < OPENROUTER_TTL_MS) {
    return _openRouterCache.models
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data: { data?: OpenRouterModel[] } = await res.json()
    const list = data.data || []
    const normalized = list.map((m) => {
      const inputPrice = parseFloat(m.pricing?.prompt || '0') * 1000 // $/1k tokens
      const outputPrice = parseFloat(m.pricing?.completion || '0') * 1000
      const isFree = inputPrice === 0 && outputPrice === 0
      return {
        id: m.id,
        provider: 'openrouter',
        display_name: m.name || m.id,
        name: m.name || m.id,
        description: m.description ? m.description.split('\n')[0].slice(0, 140) : undefined,
        max_tokens: 4096,
        context_window: m.context_length || 8192,
        supports_vision: false,
        supports_function_calling: true,
        cost_per_1k_input: inputPrice,
        cost_per_1k_output: outputPrice,
        tier: isFree ? 'free' : inputPrice < 0.001 ? 'budget' : inputPrice < 0.005 ? 'standard' : 'premium',
        category: 'flagship',
      }
    })
    _openRouterCache = { models: normalized, fetchedAt: now }
    return normalized
  } catch (err) {
    console.error('[ai/models] fetchOpenRouterCatalog failed:', err)
    return []
  }
}

// GET - Lista todos os modelos de IA disponíveis
export async function GET(request: NextRequest) {
  try {
    getDb()
  } catch {
    // Se banco não configurado, retornar modelos padrão + catalogo OpenRouter ao vivo.
    const live = await fetchOpenRouterCatalog()
    return NextResponse.json({
      models: [...getDefaultModels().filter((m) => m.provider !== 'openrouter'), ...live],
      source: live.length > 0 ? 'fallback+openrouter' : 'fallback',
    })
  }

  try {
    // Parâmetros de filtro
    const provider = request.nextUrl.searchParams.get('provider')
    const tier = request.nextUrl.searchParams.get('tier')
    const category = request.nextUrl.searchParams.get('category')

    // Query base
    let query = supabase
      .from('ai_models')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    // Aplicar filtros
    if (provider) {
      query = query.eq('provider', provider)
    }
    if (tier) {
      query = query.eq('tier', tier)
    }
    if (category) {
      query = query.eq('category', category)
    }

    const { data: models, error } = await query

    if (error) {
      console.error('Error fetching models:', error)

      // Se a tabela não existe, retornar modelos padrão + OpenRouter ao vivo
      if (error.code === '42P01') {
        const live = await fetchOpenRouterCatalog()
        return NextResponse.json({
          models: [...getDefaultModels().filter((m) => m.provider !== 'openrouter'), ...live],
          source: live.length > 0 ? 'fallback+openrouter' : 'fallback',
        })
      }

      throw error
    }

    // Se não há modelos no banco, retornar padrão + OpenRouter ao vivo
    if (!models || models.length === 0) {
      const live = await fetchOpenRouterCatalog()
      return NextResponse.json({
        models: [...getDefaultModels().filter((m) => m.provider !== 'openrouter'), ...live],
        source: live.length > 0 ? 'fallback+openrouter' : 'fallback',
      })
    }

    // DB tem modelos. Adiciona catalogo OpenRouter ao vivo sempre que possivel,
    // pq DB tipicamente nao mantem o catalogo OpenRouter (300+ entries).
    const live = await fetchOpenRouterCatalog()
    const dbHasOpenrouter = models.some((m: any) => m.provider === 'openrouter')
    return NextResponse.json({
      models: dbHasOpenrouter ? models : [...models, ...live],
      source: live.length > 0 ? 'database+openrouter' : 'database',
    })

  } catch (error: any) {
    console.error('Error in AI models API:', error)

    // Retornar modelos padrão + OpenRouter ao vivo em caso de erro
    const live = await fetchOpenRouterCatalog()
    return NextResponse.json({
      models: [...getDefaultModels().filter((m) => m.provider !== 'openrouter'), ...live],
      source: live.length > 0 ? 'fallback+openrouter' : 'fallback',
      error: error.message,
    })
  }
}

// Modelos padrão (fallback se o banco não tiver) - Atualizado Dezembro 2025
function getDefaultModels() {
  return [
    // =====================================================
    // OpenAI - Família GPT-5
    // =====================================================
    {
      id: 'gpt-5.2',
      provider: 'openai',
      display_name: 'GPT-5.2',
      description: 'Mais avançado - trabalho profissional e agentes',
      max_tokens: 128000,
      context_window: 400000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00125,
      cost_per_1k_output: 0.01,
      tier: 'premium',
      category: 'flagship',
    },
    {
      id: 'gpt-5.1',
      provider: 'openai',
      display_name: 'GPT-5.1',
      description: 'Mais conversacional e inteligente',
      max_tokens: 128000,
      context_window: 400000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00125,
      cost_per_1k_output: 0.01,
      tier: 'premium',
      category: 'flagship',
    },
    {
      id: 'gpt-5',
      provider: 'openai',
      display_name: 'GPT-5',
      description: 'Modelo unificado com raciocínio integrado',
      max_tokens: 128000,
      context_window: 400000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00125,
      cost_per_1k_output: 0.01,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'gpt-5-pro',
      provider: 'openai',
      display_name: 'GPT-5 Pro',
      description: 'Raciocínio estendido para respostas complexas',
      max_tokens: 128000,
      context_window: 400000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.005,
      cost_per_1k_output: 0.02,
      tier: 'premium',
      category: 'reasoning',
    },
    {
      id: 'gpt-5-mini',
      provider: 'openai',
      display_name: 'GPT-5 Mini',
      description: 'Versão rápida e econômica do GPT-5',
      max_tokens: 128000,
      context_window: 400000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00025,
      cost_per_1k_output: 0.001,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'gpt-5-nano',
      provider: 'openai',
      display_name: 'GPT-5 Nano',
      description: 'Ultra-econômico para tarefas simples',
      max_tokens: 32000,
      context_window: 128000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00005,
      cost_per_1k_output: 0.0002,
      tier: 'free',
      category: 'budget',
    },

    // =====================================================
    // Anthropic - Família Claude 4.5
    // =====================================================
    {
      id: 'claude-opus-4-5-20251124',
      provider: 'anthropic',
      display_name: 'Claude Opus 4.5',
      description: 'O mais inteligente - raciocínio superior e código',
      max_tokens: 64000,
      context_window: 1000000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.005,
      cost_per_1k_output: 0.025,
      tier: 'premium',
      category: 'flagship',
    },
    {
      id: 'claude-sonnet-4-5-20250929',
      provider: 'anthropic',
      display_name: 'Claude Sonnet 4.5',
      description: 'Melhor para código e agentes - 30h+ de foco',
      max_tokens: 64000,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.003,
      cost_per_1k_output: 0.015,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
      display_name: 'Claude Haiku 4.5',
      description: 'Ultra-rápido - 90% do Sonnet por fração do custo',
      max_tokens: 64000,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.001,
      cost_per_1k_output: 0.005,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'claude-opus-4-1-20250805',
      provider: 'anthropic',
      display_name: 'Claude Opus 4.1',
      description: 'Excelente para revisão de código e bugs complexos',
      max_tokens: 32000,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.015,
      cost_per_1k_output: 0.075,
      tier: 'premium',
      category: 'flagship',
    },

    // =====================================================
    // Google - Família Gemini
    // =====================================================
    {
      id: 'gemini-2.0-flash-exp',
      provider: 'google',
      display_name: 'Gemini 2.0 Flash',
      description: 'Mais recente do Google - rápido e multimodal',
      max_tokens: 8192,
      context_window: 1000000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.0001,
      cost_per_1k_output: 0.0004,
      tier: 'budget',
      category: 'flagship',
    },
    {
      id: 'gemini-1.5-pro',
      provider: 'google',
      display_name: 'Gemini 1.5 Pro',
      description: 'Modelo avançado com 1M de contexto',
      max_tokens: 8192,
      context_window: 1000000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00125,
      cost_per_1k_output: 0.005,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'gemini-1.5-flash',
      provider: 'google',
      display_name: 'Gemini 1.5 Flash',
      description: 'Versão rápida e econômica',
      max_tokens: 8192,
      context_window: 1000000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.000075,
      cost_per_1k_output: 0.0003,
      tier: 'budget',
      category: 'balanced',
    },

    // =====================================================
    // Groq - Ultra-rápido (Llama, Mixtral)
    // =====================================================
    {
      id: 'llama-3.3-70b-versatile',
      provider: 'groq',
      display_name: 'Llama 3.3 70B',
      description: 'Mais recente da Meta - muito capaz, ultra-rápido',
      max_tokens: 32768,
      context_window: 128000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00059,
      cost_per_1k_output: 0.00079,
      tier: 'budget',
      category: 'ultra-fast',
    },
    {
      id: 'llama-3.2-90b-vision-preview',
      provider: 'groq',
      display_name: 'Llama 3.2 90B Vision',
      description: 'Modelo multimodal da Meta',
      max_tokens: 8192,
      context_window: 128000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.0009,
      cost_per_1k_output: 0.0009,
      tier: 'standard',
      category: 'ultra-fast',
    },
    {
      id: 'llama-3.1-8b-instant',
      provider: 'groq',
      display_name: 'Llama 3.1 8B',
      description: 'Ultra-rápido e econômico',
      max_tokens: 8192,
      context_window: 131072,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00005,
      cost_per_1k_output: 0.00008,
      tier: 'free',
      category: 'ultra-fast',
    },
    {
      id: 'mixtral-8x7b-32768',
      provider: 'groq',
      display_name: 'Mixtral 8x7B',
      description: 'MoE da Mistral - eficiente',
      max_tokens: 32768,
      context_window: 32768,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00024,
      cost_per_1k_output: 0.00024,
      tier: 'budget',
      category: 'ultra-fast',
    },

    // =====================================================
    // DeepSeek - Excelente custo-benefício
    // =====================================================
    {
      id: 'deepseek-chat',
      provider: 'deepseek',
      display_name: 'DeepSeek V3',
      description: 'Qualidade GPT-4 por fração do preço',
      max_tokens: 8192,
      context_window: 64000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00014,
      cost_per_1k_output: 0.00028,
      tier: 'budget',
      category: 'budget',
    },
    {
      id: 'deepseek-reasoner',
      provider: 'deepseek',
      display_name: 'DeepSeek R1',
      description: 'Raciocínio avançado - compete com O1',
      max_tokens: 8192,
      context_window: 64000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00055,
      cost_per_1k_output: 0.00219,
      tier: 'budget',
      category: 'reasoning',
    },

    // =====================================================
    // Mistral - Modelos europeus de alta qualidade
    // =====================================================
    {
      id: 'mistral-large-latest',
      provider: 'mistral',
      display_name: 'Mistral Large',
      description: 'Modelo flagship da Mistral',
      max_tokens: 8192,
      context_window: 128000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.002,
      cost_per_1k_output: 0.006,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'mistral-small-latest',
      provider: 'mistral',
      display_name: 'Mistral Small',
      description: 'Rápido e econômico',
      max_tokens: 8192,
      context_window: 32000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.001,
      cost_per_1k_output: 0.003,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'codestral-latest',
      provider: 'mistral',
      display_name: 'Codestral',
      description: 'Especializado em código',
      max_tokens: 8192,
      context_window: 32000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.001,
      cost_per_1k_output: 0.003,
      tier: 'standard',
      category: 'code',
    },

    // =====================================================
    // xAI - Grok
    // =====================================================
    {
      id: 'grok-2-1212',
      provider: 'xai',
      display_name: 'Grok 2',
      description: 'Modelo flagship da xAI',
      max_tokens: 8192,
      context_window: 131072,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.002,
      cost_per_1k_output: 0.01,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'grok-2-vision-1212',
      provider: 'xai',
      display_name: 'Grok 2 Vision',
      description: 'Grok com capacidades de visão',
      max_tokens: 8192,
      context_window: 32768,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.002,
      cost_per_1k_output: 0.01,
      tier: 'standard',
      category: 'flagship',
    },

    // =====================================================
    // OpenRouter — slugs reais do https://openrouter.ai/models
    // Lista curada dos mais usados; full list dinamica via
    // OpenRouter API (https://openrouter.ai/api/v1/models) fica
    // pra Onda 13 quando quisermos catalogo completo.
    // =====================================================
    {
      id: 'openai/gpt-4o-mini',
      provider: 'openrouter',
      display_name: 'GPT-4o Mini (via OpenRouter)',
      description: 'Custo-beneficio classico — rapido e barato',
      max_tokens: 16384,
      context_window: 128000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00015,
      cost_per_1k_output: 0.0006,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'openai/gpt-4o',
      provider: 'openrouter',
      display_name: 'GPT-4o (via OpenRouter)',
      description: 'OpenAI flagship multimodal',
      max_tokens: 16384,
      context_window: 128000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.0025,
      cost_per_1k_output: 0.01,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      provider: 'openrouter',
      display_name: 'Claude 3.5 Sonnet (via OpenRouter)',
      description: 'Raciocinio top e conversa fluida (recomendado)',
      max_tokens: 8192,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.003,
      cost_per_1k_output: 0.015,
      tier: 'premium',
      category: 'flagship',
    },
    {
      id: 'anthropic/claude-3-haiku',
      provider: 'openrouter',
      display_name: 'Claude 3 Haiku (via OpenRouter)',
      description: 'Claude rapido e barato',
      max_tokens: 4096,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00025,
      cost_per_1k_output: 0.00125,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'google/gemini-flash-1.5',
      provider: 'openrouter',
      display_name: 'Gemini 1.5 Flash (via OpenRouter)',
      description: 'Gemini economico com contexto grande',
      max_tokens: 8192,
      context_window: 1000000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.000075,
      cost_per_1k_output: 0.0003,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'google/gemini-pro-1.5',
      provider: 'openrouter',
      display_name: 'Gemini 1.5 Pro (via OpenRouter)',
      description: 'Gemini flagship contexto extremo',
      max_tokens: 8192,
      context_window: 2000000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00125,
      cost_per_1k_output: 0.005,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'deepseek/deepseek-chat',
      provider: 'openrouter',
      display_name: 'DeepSeek Chat (via OpenRouter)',
      description: 'Excelente custo-beneficio chines',
      max_tokens: 8192,
      context_window: 64000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00014,
      cost_per_1k_output: 0.00028,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'meta-llama/llama-3.1-70b-instruct',
      provider: 'openrouter',
      display_name: 'Llama 3.1 70B (via OpenRouter)',
      description: 'Open source Meta — bom raciocinio',
      max_tokens: 8192,
      context_window: 131072,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00059,
      cost_per_1k_output: 0.00079,
      tier: 'standard',
      category: 'balanced',
    },
    {
      id: 'meta-llama/llama-3.1-8b-instruct',
      provider: 'openrouter',
      display_name: 'Llama 3.1 8B (via OpenRouter)',
      description: 'Ultra barato pra atendimento simples',
      max_tokens: 8192,
      context_window: 131072,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00006,
      cost_per_1k_output: 0.00006,
      tier: 'free',
      category: 'budget',
    },
    {
      id: 'mistralai/mistral-large',
      provider: 'openrouter',
      display_name: 'Mistral Large (via OpenRouter)',
      description: 'Flagship europeu — bom em portugues',
      max_tokens: 8192,
      context_window: 128000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.002,
      cost_per_1k_output: 0.006,
      tier: 'standard',
      category: 'flagship',
    },
  ]
}
