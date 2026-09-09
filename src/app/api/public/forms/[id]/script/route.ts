import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { buildPopupScript } from './generator'
import { attachExperiments } from '@/lib/popups/experiment-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, name, status, design_json, behavior, form_type, success_message, redirect_url, ab_parent_id, store_id, organization_id')
      .eq('id', params.id)
      .single()

    if (!form || form.status !== 'published' || form.ab_parent_id) {
      return new Response('/* Form not published */', { headers: { 'Content-Type': 'application/javascript' } })
    }

    // Popup preso a uma loja só sai na loja dela: o snippet leva ?domain=
    // e a loja é resolvida do mesmo jeito que no bundle.
    if (form.store_id) {
      const { sanitizeDomain } = await import('@/lib/forms/submit-utils')
      const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain')
      const domain = sanitizeDomain(req.nextUrl.searchParams.get('domain'))
      const store = domain ? await resolveStoreByDomain<{ id: string }>(supabaseAdmin, domain, { select: 'id', activeOnly: true }) : null
      if (!store || store.id !== form.store_id) {
        return new Response('/* worder: este popup pertence a outra loja — use o script da loja (bundle) ou o snippet com ?domain= */', { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=300' } })
      }
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
    const experiments = await attachExperiments(supabaseAdmin, [form])
    const script = buildPopupScript({ ...form, experiment: experiments.get(form.id) || null }, baseUrl)

    return new Response(script, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new Response('/* Error */', { headers: { 'Content-Type': 'application/javascript' } })
  }
}
