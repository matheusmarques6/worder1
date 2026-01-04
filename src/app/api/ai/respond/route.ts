import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  return data?.organization_id
}

// POST - Gerar resposta de IA
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const orgId = await getOrgId(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      agent_id,
      conversation_id,
      message,
      context = [],
      // Ou passar config diretamente
      provider,
      model,
      system_prompt,
      temperature = 0.3,
      max_tokens = 500,
    } = body

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    let aiConfig: any = null

    // Se tem agent_id, buscar config do agente
    if (agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('ai_config')
        .eq('id', agent_id)
        .eq('organization_id', orgId)
        .single()

      if (agent?.ai_config) {
        aiConfig = agent.ai_config
      } else {
        // Tentar tabela de config separada
        const { data: config } = await supabase
          .from('ai_agent_configs')
          .select('*')
          .eq('agent_id', agent_id)
          .single()

        if (config) {
          aiConfig = config
        }
      }
    }

    // Se não tem config do agente, usar os parâmetros passados
    if (!aiConfig) {
      aiConfig = {
        provider: provider || 'openai',
        model: model || 'gpt-4o-mini',
        system_prompt: system_prompt || 'Você é um assistente virtual prestativo.',
        temperature: temperature,
        max_tokens: max_tokens,
      }
    }

    // Buscar API key do cliente
    const { data: apiKeyData } = await supabase
      .from('organization_api_keys')
      .select('api_key, base_url')
      .eq('organization_id', orgId)
      .eq('provider', aiConfig.provider)
      .eq('is_valid', true)
      .single()

    if (!apiKeyData) {
      return NextResponse.json(
        { error: `API key não encontrada para ${aiConfig.provider}. Configure em Configurações → API Keys.` },
        { status: 400 }
      )
    }

    // Montar mensagens
    const messages = [
      { role: 'system', content: aiConfig.system_prompt },
      ...context.map((msg: any) => ({
        role: msg.is_from_me ? 'assistant' : 'user',
        content: msg.content || msg.text,
      })),
      { role: 'user', content: message },
    ]

    // Chamar o provider
    let response: string
    let tokensUsed = { input: 0, output: 0 }

    switch (aiConfig.provider) {
      case 'openai':
        const openaiResult = await callOpenAI(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
        response = openaiResult.content
        tokensUsed = openaiResult.tokens
        break

      case 'anthropic':
        const anthropicResult = await callAnthropic(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
        response = anthropicResult.content
        tokensUsed = anthropicResult.tokens
        break

      case 'google':
        const googleResult = await callGoogle(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
        response = googleResult.content
        tokensUsed = googleResult.tokens
        break

      case 'groq':
        const groqResult = await callGroq(apiKeyData.api_key, aiConfig.model, messages, aiConfig.temperature, aiConfig.max_tokens)
        response = groqResult.content
        tokensUsed = groqResult.tokens
        break

      default:
        // Fallback para OpenAI-compatible
        const defaultResult = await callOpenAICompatible(
          apiKeyData.api_key,
          aiConfig.model,
          messages,
          aiConfig.temperature,
          aiConfig.max_tokens,
          apiKeyData.base_url
        )
        response = defaultResult.content
        tokensUsed = defaultResult.tokens
    }

    // Registrar uso
    await logUsage(supabase, orgId, agent_id, aiConfig.provider, aiConfig.model, tokensUsed)

    // Atualizar API key stats
    await supabase
      .from('organization_api_keys')
      .update({
        total_requests: supabase.rpc('increment', { x: 1 }),
        total_tokens_used: supabase.rpc('increment', { x: tokensUsed.input + tokensUsed.output }),
        last_used_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('provider', aiConfig.provider)

    return NextResponse.json({
      response,
      tokens: tokensUsed,
      model: aiConfig.model,
      provider: aiConfig.provider,
    })

  } catch (error: any) {
    console.error('Error generating AI response:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// OpenAI
async function callOpenAI(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'OpenAI API error')
  }

  const data = await res.json()
  return {
    content: data.choices[0].message.content,
    tokens: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
    },
  }
}

// Anthropic
async function callAnthropic(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number) {
  // Separar system message
  const systemMessage = messages.find(m => m.role === 'system')?.content || ''
  const chatMessages = messages.filter(m => m.role !== 'system')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemMessage,
      messages: chatMessages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'Anthropic API error')
  }

  const data = await res.json()
  return {
    content: data.content[0].text,
    tokens: {
      input: data.usage?.input_tokens || 0,
      output: data.usage?.output_tokens || 0,
    },
  }
}

// Google
async function callGoogle(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number) {
  // Converter formato de mensagens
  const systemInstruction = messages.find(m => m.role === 'system')?.content || ''
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    }
  )

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'Google API error')
  }

  const data = await res.json()
  return {
    content: data.candidates[0].content.parts[0].text,
    tokens: {
      input: data.usageMetadata?.promptTokenCount || 0,
      output: data.usageMetadata?.candidatesTokenCount || 0,
    },
  }
}

// Groq
async function callGroq(apiKey: string, model: string, messages: any[], temperature: number, maxTokens: number) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'Groq API error')
  }

  const data = await res.json()
  return {
    content: data.choices[0].message.content,
    tokens: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
    },
  }
}

// OpenAI Compatible (DeepSeek, Together, etc)
async function callOpenAICompatible(
  apiKey: string,
  model: string,
  messages: any[],
  temperature: number,
  maxTokens: number,
  baseUrl?: string
) {
  const url = baseUrl || 'https://api.openai.com/v1'
  
  const res = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error?.message || 'API error')
  }

  const data = await res.json()
  return {
    content: data.choices[0].message.content,
    tokens: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
    },
  }
}

// Log usage
async function logUsage(
  supabase: any,
  orgId: string,
  agentId: string | undefined,
  provider: string,
  model: string,
  tokens: { input: number; output: number }
) {
  try {
    await supabase.from('ai_usage_logs').insert({
      organization_id: orgId,
      agent_id: agentId,
      provider,
      model,
      tokens_input: tokens.input,
      tokens_output: tokens.output,
      tokens_total: tokens.input + tokens.output,
    })
  } catch (error) {
    // Tabela pode não existir ainda
    console.log('Could not log AI usage:', error)
  }
}
