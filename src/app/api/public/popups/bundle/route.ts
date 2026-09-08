// =============================================
// GET /api/public/popups/bundle?domain=<loja>
//
// Um script só com todos os popups publicados da loja. O loader antigo
// fazia um XHR para listar e depois injetava um <script> por popup — N+1
// viagens em toda página da loja. Aqui é uma, cacheada na borda por 60 s
// com ETag (o navegador revalida de graça).
//
// A loja é resolvida pelo domínio com a mesma função dos outros endpoints
// públicos (exata, com aliases, sem sufixo): um domínio parecido nunca
// recebe os popups de outra loja. Popups com store_id só saem na sua loja;
// sem store_id saem em todas as lojas da org.
// =============================================

import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeDomain, isVisualPopupForm } from '@/lib/forms/submit-utils'
import { buildPopupScript, compactScript } from '@/app/api/public/forms/[id]/script/generator'
import { attachExperiments } from '@/lib/popups/experiment-service'

export const dynamic = 'force-dynamic'

// Muda a cada deploy: um runtime novo nunca fica preso num 304 antigo.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev'

const JS_HEADERS = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
}

function js(body: string, extra: Record<string, string> = {}, status = 200) {
  return new Response(body, { status, headers: { ...JS_HEADERS, ...extra } })
}

export async function GET(req: NextRequest) {
  const domain = sanitizeDomain(req.nextUrl.searchParams.get('domain'))
  if (!domain) return js('/* worder: domínio ausente */', { 'Cache-Control': 'public, max-age=300' })

  try {
    const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain')
    const store = await resolveStoreByDomain<{ id: string; organization_id: string }>(
      supabaseAdmin, domain, { select: 'id, organization_id', activeOnly: true },
    )
    if (!store) return js('/* worder: loja não encontrada */', { 'Cache-Control': 'public, max-age=300' })

    const { data: rows } = await supabaseAdmin
      .from('crm_forms')
      .select('id, name, status, design_json, behavior, form_type, success_message, redirect_url, store_id, updated_at, ab_parent_id')
      .eq('organization_id', store.organization_id)
      .eq('status', 'published')
      .order('created_at', { ascending: true })

    // Só popups visuais com etapas: um formulário clássico publicado
    // (design_json vazio) viraria um popup em branco após 5 s.
    const forms = (rows || []).filter((f: any) =>
      (!f.store_id || f.store_id === store.id) &&
      !f.ab_parent_id &&
      isVisualPopupForm(f.form_type, f.design_json) &&
      Array.isArray(f.design_json?.steps) && f.design_json.steps.length > 0,
    )
    // Experimentos em andamento: o script do pai leva as variantes.
    const experiments = await attachExperiments(supabaseAdmin, forms)
    for (const f of forms as any[]) f.experiment = experiments.get(f.id) || null

    // Maior prioridade primeiro: o script dela roda antes e registra a
    // intenção antes dos outros.
    forms.sort((a: any, b: any) => (Number(b.behavior?.priority) || 0) - (Number(a.behavior?.priority) || 0))

    const etag = '"' + createHash('sha1')
      .update(forms.map((f: any) => `${f.id}:${f.updated_at}:${f.experiment ? f.experiment.id + ':' + JSON.stringify(f.experiment.split) + ':' + JSON.stringify(f.experiment.bandit || null) : ''}`).join('|') + '|v4|' + BUILD_ID)
      .digest('hex').slice(0, 20) + '"'

    const cache = { 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=600', ETag: etag }

    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ...JS_HEADERS, ...cache } })
    }

    if (forms.length === 0) return js('/* worder: nenhum popup publicado */', cache)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
    // Cada popup isolado: um erro num deles não derruba os outros.
    const parts = forms.map((f: any) => 'try{' + compactScript(buildPopupScript(f, baseUrl)) + '}catch(e){try{console.warn("[worder popup]",e)}catch(_){}}')
    const body = `/* worder popups · ${forms.length} · ${etag} */\n` + parts.join('\n')
    return js(body, cache)
  } catch (e: any) {
    console.error('[popups/bundle] falhou:', e?.message)
    return js('/* worder: erro ao montar o bundle */', { 'Cache-Control': 'no-store' })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...JS_HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  })
}
