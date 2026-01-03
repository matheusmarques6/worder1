import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

// ✅ MIGRADO PARA RLS - Apenas admins podem gerenciar API keys

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '***'
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

// GET - Lista API keys da organização
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  
  // Verificar se é admin
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { data: keys, error } = await supabase
      .from('organization_api_keys')
      .select('id, provider, api_key_hint, is_active, is_valid, last_validated_at, total_requests, total_tokens_used, last_used_at, created_at')
      // RLS filtra automaticamente por organization_id
      .order('provider', { ascending: true })

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ keys: [] })
      }
      throw error
    }

    return NextResponse.json({ keys: keys || [] })

  } catch (error: any) {
    console.error('Error fetching API keys:', error)
    return NextResponse.json({ keys: [], error: error.message })
  }
}

// POST - Adicionar/atualizar API key
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  
  // Verificar se é admin
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json()
    // Ignorar organization_id do body - usar o do usuário autenticado
    const { provider, api_key, base_url } = body

    if (!provider || !api_key) {
      return NextResponse.json(
        { error: 'provider and api_key are required' },
        { status: 400 }
      )
    }

    const validProviders = ['openai', 'anthropic', 'google', 'groq', 'mistral', 'deepseek', 'cohere', 'together', 'openrouter', 'perplexity', 'xai', 'ollama']
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Valid options: ${validProviders.join(', ')}` },
        { status: 400 }
      )
    }

    const validation = await validateApiKey(provider, api_key, base_url)

    const { data, error } = await supabase
      .from('organization_api_keys')
      .upsert({
        organization_id: user.organization_id, // Usa org do usuário autenticado
        provider,
        api_key,
        api_key_hint: maskApiKey(api_key),
        base_url: base_url || null,
        is_active: true,
        is_valid: validation.valid,
        last_validated_at: new Date().toISOString(),
        last_error: validation.error || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,provider'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      key: {
        id: data.id,
        provider: data.provider,
        api_key_hint: data.api_key_hint,
        is_valid: data.is_valid,
      },
      validation,
    })

  } catch (error: any) {
    console.error('Error saving API key:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover API key
export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  
  // Verificar se é admin
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get('provider')
    
    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('organization_api_keys')
      .delete()
      // RLS garante que só deleta da própria org
      .eq('provider', provider)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error deleting API key:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Função para validar API key
async function validateApiKey(provider: string, apiKey: string, baseUrl?: string): Promise<{ valid: boolean; error?: string }> {
  try {
    switch (provider) {
      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (!res.ok) {
          const error = await res.json()
          return { valid: false, error: error.error?.message || 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          })
        })
        if (res.status === 401) {
          return { valid: false, error: 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'google': {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
        if (!res.ok) {
          return { valid: false, error: 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'groq': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (!res.ok) {
          return { valid: false, error: 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'mistral': {
        const res = await fetch('https://api.mistral.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (!res.ok) {
          return { valid: false, error: 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'deepseek': {
        const res = await fetch('https://api.deepseek.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (!res.ok) {
          return { valid: false, error: 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'together': {
        const res = await fetch('https://api.together.xyz/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (!res.ok) {
          return { valid: false, error: 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (!res.ok) {
          return { valid: false, error: 'Invalid API key' }
        }
        return { valid: true }
      }

      case 'ollama': {
        const url = baseUrl || 'http://localhost:11434'
        try {
          const res = await fetch(`${url}/api/tags`)
          if (!res.ok) {
            return { valid: false, error: 'Ollama server not accessible' }
          }
          return { valid: true }
        } catch {
          return { valid: false, error: 'Cannot connect to Ollama server' }
        }
      }

      default:
        return { valid: true }
    }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}
