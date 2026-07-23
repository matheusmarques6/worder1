// =============================================
// PUBLIC FORM EVENT API - Fire events (thank you page, stage change)
// =============================================
import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { META_BASE_URL } from '@/lib/whatsapp/api-version'
import { corsJson, corsError, corsPreflight } from '@/lib/forms/public-cors'

export const dynamic = 'force-dynamic'

// POST - Fire an event (e.g., page view on thank you page, meeting scheduled)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return corsError('Database not configured', 503, 'db_unavailable')
    }

    const formId = params.id

    // Rate limit: this endpoint fires server-side Facebook CAPI conversions
    // using the org's Meta token. Without a limit, anyone who knows a
    // submission_id could spam duplicate conversions and burn Meta quota.
    // (The current storefront script posts to /events, not here — this is
    // a legacy path kept alive but now guarded.)
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`form:event:${formId}:${ip}`, { limit: 20, windowSec: 60 })
    if (!rl.allowed) {
      return corsError('Muitas tentativas. Aguarde e tente novamente.', 429, 'rate_limited')
    }

    const body = await request.json()
    const { submission_id, event_type } = body

    if (!submission_id || !event_type) {
      return corsError('submission_id e event_type são obrigatórios', 400, 'invalid_payload')
    }

    // Buscar submission
    const { data: submission } = await supabase
      .from('crm_form_submissions')
      .select('*, form:crm_forms(*)')
      .eq('id', submission_id)
      .eq('form_id', formId)
      .single()

    if (!submission) {
      return corsError('Submission não encontrada', 404, 'not_found')
    }

    // Buscar eventos que correspondam ao trigger
    const { data: events } = await supabase
      .from('crm_form_events')
      .select('*')
      .eq('form_id', formId)
      .eq('is_active', true)
      .eq('trigger_type', event_type === 'page_view' ? 'on_page_view' : 'on_stage_change')

    if (!events || events.length === 0) {
      return corsJson({ events_fired: [] })
    }

    const eventsFired: any[] = []
    const form = submission.form

    for (const event of events) {
      // Fire Facebook event
      if (event.send_to_facebook && form.facebook_pixel_id) {
        const { data: metaAccount } = await supabase
          .from('meta_accounts')
          .select('access_token')
          .eq('organization_id', form.organization_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()

        if (metaAccount?.access_token) {
          const fbEvent = {
            event_name: event.event_name,
            event_time: Math.floor(Date.now() / 1000),
            event_id: `${submission_id}-${event.id}`,
            action_source: 'website',
            event_source_url: request.headers.get('referer') || '',
            user_data: {
              client_ip_address: request.headers.get('x-forwarded-for') || '',
              client_user_agent: request.headers.get('user-agent') || '',
            },
            custom_data: event.event_value ? {
              value: event.event_value,
              currency: event.event_currency || 'BRL',
            } : undefined,
          }

          try {
            const response = await fetch(
              `${META_BASE_URL}/${form.facebook_pixel_id}/events`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  data: [fbEvent],
                  access_token: metaAccount.access_token,
                }),
              }
            )
            const result = await response.json()

            await supabase
              .from('crm_form_event_logs')
              .insert({
                event_id: event.id,
                submission_id: submission_id,
                form_id: formId,
                organization_id: form.organization_id,
                platform: 'facebook',
                event_name: event.event_name,
                event_data: fbEvent,
                status: result.error ? 'failed' : 'sent',
                error_message: result.error ? JSON.stringify(result.error) : null,
                response_data: result,
              })

            eventsFired.push({
              event: event.event_name,
              platform: 'facebook',
              success: !result.error,
            })
          } catch (err: any) {
            eventsFired.push({
              event: event.event_name,
              platform: 'facebook',
              success: false,
              error: err.message,
            })
          }
        }
      }

      if (event.send_to_google) {
        eventsFired.push({
          event: event.event_name,
          platform: 'google',
          success: true,
        })
      }
    }

    return corsJson({ events_fired: eventsFired })
  } catch (error: any) {
    console.error('[Form Event] Error:', error)
    return corsError(error.message || 'Erro interno', 500, 'server_error')
  }
}

export async function OPTIONS() {
  return corsPreflight()
}
