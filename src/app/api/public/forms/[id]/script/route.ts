import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { buildPopupScript } from './generator'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, name, status, design_json, behavior, form_type, success_message, redirect_url')
      .eq('id', params.id)
      .single()

    if (!form || form.status !== 'published') {
      return new Response('/* Form not published */', { headers: { 'Content-Type': 'application/javascript' } })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
    const script = buildPopupScript(form, baseUrl)

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
