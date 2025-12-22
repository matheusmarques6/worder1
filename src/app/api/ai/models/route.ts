import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'
import { SupabaseClient } from '@supabase/supabase-js'

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

// GET - Lista todos os modelos de IA disponíveis
export async function GET(request: NextRequest) {
  try {
    getDb()
  } catch {
    // Se banco não configurado, retornar modelos padrão
    return NextResponse.json({
      models: getDefaultModels(),
      source: 'fallback'
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
      
      // Se a tabela não existe, retornar modelos padrão
      if (error.code === '42P01') {
        return NextResponse.json({
          models: getDefaultModels(),
          source: 'fallback'
        })
      }
      
      throw error
    }

    // Se não há modelos no banco, retornar padrão
    if (!models || models.length === 0) {
      return NextResponse.json({
        models: getDefaultModels(),
        source: 'fallback'
      })
    }

    return NextResponse.json({ 
      models,
      source: 'database'
    })

  } catch (error: any) {
    console.error('Error in AI models API:', error)
    
    // Retornar modelos padrão em caso de erro
    return NextResponse.json({
      models: getDefaultModels(),
      source: 'fallback',
      error: error.message
    })
  }
}

// Modelos padrão (fallback se o banco não tiver) - Atualizado Dezembro 2024
function getDefaultModels() {
  return [
    // =====================================================
    // OpenAI - Modelos mais recentes
    // =====================================================
    {
      id: 'gpt-4.5-preview',
      provider: 'openai',
      display_name: 'GPT-4.5 Preview',
      description: 'Modelo mais avançado da OpenAI - raciocínio superior',
      max_tokens: 16384,
      context_window: 128000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.075,
      cost_per_1k_output: 0.15,
      tier: 'premium',
      category: 'flagship',
    },
    {
      id: 'o1',
      provider: 'openai',
      display_name: 'O1',
      description: 'Raciocínio avançado - ideal para tarefas complexas',
      max_tokens: 100000,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.015,
      cost_per_1k_output: 0.06,
      tier: 'premium',
      category: 'reasoning',
    },
    {
      id: 'o1-mini',
      provider: 'openai',
      display_name: 'O1 Mini',
      description: 'Raciocínio rápido e econômico',
      max_tokens: 65536,
      context_window: 128000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.003,
      cost_per_1k_output: 0.012,
      tier: 'standard',
      category: 'reasoning',
    },
    {
      id: 'gpt-4o',
      provider: 'openai',
      display_name: 'GPT-4o',
      description: 'Modelo flagship multimodal - melhor qualidade geral',
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
      id: 'gpt-4o-mini',
      provider: 'openai',
      display_name: 'GPT-4o Mini',
      description: 'Versão econômica do GPT-4o - melhor custo-benefício',
      max_tokens: 16384,
      context_window: 128000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00015,
      cost_per_1k_output: 0.0006,
      tier: 'budget',
      category: 'balanced',
    },

    // =====================================================
    // Anthropic - Família Claude 4 e 3.5
    // =====================================================
    {
      id: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      display_name: 'Claude Sonnet 4',
      description: 'Modelo mais recente - excelente em código e análise',
      max_tokens: 16384,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.003,
      cost_per_1k_output: 0.015,
      tier: 'premium',
      category: 'flagship',
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      display_name: 'Claude 3.5 Sonnet',
      description: 'Excelente equilíbrio qualidade/velocidade',
      max_tokens: 8192,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.003,
      cost_per_1k_output: 0.015,
      tier: 'standard',
      category: 'flagship',
    },
    {
      id: 'claude-3-5-haiku-20241022',
      provider: 'anthropic',
      display_name: 'Claude 3.5 Haiku',
      description: 'Ultra-rápido e muito econômico',
      max_tokens: 8192,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.0008,
      cost_per_1k_output: 0.004,
      tier: 'budget',
      category: 'balanced',
    },
    {
      id: 'claude-3-opus-20240229',
      provider: 'anthropic',
      display_name: 'Claude 3 Opus',
      description: 'Máxima qualidade para tarefas complexas',
      max_tokens: 4096,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.015,
      cost_per_1k_output: 0.075,
      tier: 'premium',
      category: 'flagship',
    },

    // =====================================================
    // Google - Família Gemini 2.0
    // =====================================================
    {
      id: 'gemini-2.0-flash',
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
      id: 'gemini-2.0-flash-thinking',
      provider: 'google',
      display_name: 'Gemini 2.0 Flash Thinking',
      description: 'Raciocínio avançado do Google',
      max_tokens: 8192,
      context_window: 1000000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.0001,
      cost_per_1k_output: 0.0004,
      tier: 'standard',
      category: 'reasoning',
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
      id: 'llama-3.1-70b-versatile',
      provider: 'groq',
      display_name: 'Llama 3.1 70B',
      description: 'Modelo robusto e versátil',
      max_tokens: 32768,
      context_window: 131072,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00059,
      cost_per_1k_output: 0.00079,
      tier: 'budget',
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
      description: 'Modelo mais recente - qualidade GPT-4 por 1% do preço',
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
      id: 'grok-2',
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
      id: 'grok-2-vision',
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
  ]
}
