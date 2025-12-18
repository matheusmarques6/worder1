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

// Modelos padrão (fallback se o banco não tiver)
function getDefaultModels() {
  return [
    // OpenAI
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
      tier: 'premium',
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
    {
      id: 'gpt-3.5-turbo',
      provider: 'openai',
      display_name: 'GPT-3.5 Turbo',
      description: 'Modelo rápido e econômico',
      max_tokens: 4096,
      context_window: 16385,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.0005,
      cost_per_1k_output: 0.0015,
      tier: 'budget',
      category: 'budget',
    },

    // Anthropic
    {
      id: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      display_name: 'Claude 3.5 Sonnet',
      description: 'Modelo mais inteligente da Anthropic',
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
      id: 'claude-3-haiku-20240307',
      provider: 'anthropic',
      display_name: 'Claude 3 Haiku',
      description: 'Ultra-rápido e econômico',
      max_tokens: 4096,
      context_window: 200000,
      supports_vision: true,
      supports_function_calling: true,
      cost_per_1k_input: 0.00025,
      cost_per_1k_output: 0.00125,
      tier: 'budget',
      category: 'budget',
    },

    // Google
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

    // Groq
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

    // DeepSeek
    {
      id: 'deepseek-chat',
      provider: 'deepseek',
      display_name: 'DeepSeek Chat',
      description: 'Modelo conversacional barato e bom',
      max_tokens: 8192,
      context_window: 64000,
      supports_vision: false,
      supports_function_calling: true,
      cost_per_1k_input: 0.00014,
      cost_per_1k_output: 0.00028,
      tier: 'budget',
      category: 'budget',
    },

    // Mistral
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
  ]
}
