import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Modelos que o runtime consegue usar: o runtime fala com a OpenRouter, e o
// campo Modelo do Construtor é um slug dela ("google/gemini-3.5-flash").
// A lista é pública; guardamos por 1 hora. Sem rede, a tela cai na lista
// curta (builder-model.MODELS) e mantém o modelo atual do agente.
interface OrModel { id: string; name: string; prompt_per_m: number | null; completion_per_m: number | null; context: number | null }

let cache: { at: number; models: OrModel[] } | null = null
const TTL = 3600_000

const perM = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1000) / 1000 : null
}

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json({ models: cache.models })
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { cache: 'no-store' })
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
    const body = await res.json()
    const models: OrModel[] = (Array.isArray(body?.data) ? body.data : [])
      .filter((m: any) => typeof m?.id === 'string' && (m?.architecture?.output_modalities ?? ['text']).includes('text'))
      .map((m: any) => ({
        id: m.id,
        name: String(m.name ?? m.id),
        prompt_per_m: perM(m.pricing?.prompt),
        completion_per_m: perM(m.pricing?.completion),
        context: Number.isFinite(Number(m.context_length)) ? Number(m.context_length) : null,
      }))
      .sort((a: OrModel, b: OrModel) => a.id.localeCompare(b.id))
    cache = { at: Date.now(), models }
    return NextResponse.json({ models })
  } catch (e: any) {
    return NextResponse.json({ models: cache?.models ?? [], error: e.message })
  }
}
