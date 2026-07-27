// =============================================
// API: POST /api/whatsapp/inbox/conversations/[id]/send-template
//
// Sends an APPROVED WhatsApp Business template message in the context
// of an existing conversation. Required for messages outside the
// 24h customer service window — Meta only accepts free-form text
// inside the window, but templates work any time.
//
// Body: { templateName, language, parameters?: string[] }
// parameters are positional values for {{1}}..{{N}} in the template body.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api'
import { getAccessToken } from '@/lib/whatsapp/account-loader'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import {
  requireOptIn,
  readOverrideFromRequest,
  buildOptOutBlockedResponse,
} from '@/lib/whatsapp/opt-out-guard'
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

function countBodyVariables(bodyText: string | null | undefined): number {
  if (!bodyText) return 0
  const matches = bodyText.match(/\{\{\s*\d+\s*\}\}/g)
  return matches ? matches.length : 0
}

function renderPreview(bodyText: string, parameters: string[]): string {
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const idx = parseInt(n, 10) - 1
    return parameters[idx] ?? `{{${n}}}`
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_CACHE_HEADERS })
    }

    const templateName: string | undefined = body?.templateName
    const language: string = body?.language || 'pt_BR'
    const parameters: string[] = Array.isArray(body?.parameters) ? body.parameters : []

    if (!templateName) {
      return NextResponse.json(
        { error: 'templateName is required' },
        { status: 400, headers: NO_CACHE_HEADERS },
      )
    }

    const { data: cloudConv, error: convErr } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*, account:whatsapp_business_accounts(*)')
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (convErr) {
      console.error('[send-template] conversation lookup error:', convErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500, headers: NO_CACHE_HEADERS })
    }
    if (!cloudConv || !cloudConv.account) {
      return NextResponse.json(
        { error: 'Conversation not found or not a Cloud API conversation' },
        { status: 404, headers: NO_CACHE_HEADERS },
      )
    }

    const { data: template, error: tplErr } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('name', templateName)
      .eq('language', language)
      .or(`organization_id.eq.${orgId},organization_id.eq.00000000-0000-0000-0000-000000000000`)
      .maybeSingle()

    if (tplErr) {
      console.error('[send-template] template lookup error:', tplErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500, headers: NO_CACHE_HEADERS })
    }
    if (!template) {
      return NextResponse.json(
        { error: `Template "${templateName}" (${language}) not found for this organization` },
        { status: 404, headers: NO_CACHE_HEADERS },
      )
    }
    if (template.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `Template not APPROVED (current status: ${template.status})` },
        { status: 400, headers: NO_CACHE_HEADERS },
      )
    }

    const expectedVars = countBodyVariables(template.body_text)
    if (expectedVars !== parameters.length) {
      return NextResponse.json(
        { error: `Template expects ${expectedVars} variable(s), received ${parameters.length}` },
        { status: 400, headers: NO_CACHE_HEADERS },
      )
    }

    const components = parameters.length
      ? [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }]
      : undefined

    const phoneNumber = cloudConv.contact_phone || cloudConv.wa_id

    // Onda 10 — guard opt-out. UTILITY/AUTHENTICATION passa transacional;
    // MARKETING e bloqueado e nao aceita override (regra de produto).
    const optCheck = await requireOptIn(
      orgId,
      phoneNumber,
      template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | undefined,
      {
        ...(readOverrideFromRequest(request, auth.userId) || {}),
        sender: 'inbox.send_template',
      },
    )
    if (!optCheck.allowed) {
      return NextResponse.json(
        buildOptOutBlockedResponse(optCheck, template.category),
        { status: 409, headers: NO_CACHE_HEADERS },
      )
    }

    // Send guard — tier da Meta + circuit breaker (paridade com campanhas).
    // Template fora da janela de 24h é exatamente o caso que a Meta
    // monitora para qualidade — cota diária bloqueia com mensagem clara.
    const guardCheck = await checkBeforeSend({
      accountId: cloudConv.account.id,
      recipientPhone: phoneNumber,
      messagingLimit: cloudConv.account.messaging_limit,
    })
    if (!guardCheck.allowed) {
      const body429 = buildRateLimitedResponseBody(guardCheck)
      return NextResponse.json(body429, {
        status: 429,
        headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(body429.retryAfter) },
      })
    }

    const client = createWhatsAppCloudClient({
      phoneNumberId: cloudConv.account.phone_number_id,
      accessToken: getAccessToken(cloudConv.account),
    })

    let result
    try {
      result = await client.sendTemplate(phoneNumber, templateName, language, components)
    } catch (apiError: any) {
      console.error('[send-template] Cloud API error:', apiError)
      await reportSendResult({
        accountId: cloudConv.account.id,
        success: false,
        errorCode: apiError?.code,
        error: apiError,
        messagingLimit: cloudConv.account.messaging_limit,
      })
      return NextResponse.json(
        { error: apiError.message || 'Failed to send template', code: apiError.code },
        { status: 400, headers: NO_CACHE_HEADERS },
      )
    }
    await reportSendResult({ accountId: cloudConv.account.id, success: true })

    const messageId = result.messages?.[0]?.id
    const renderedBody = renderPreview(template.body_text || templateName, parameters)

    const { data: saved } = await supabase
      .from('whatsapp_cloud_messages')
      .upsert({
        organization_id: cloudConv.organization_id,
        store_id: cloudConv.store_id || cloudConv.account?.store_id || null,
        waba_id: cloudConv.account.id,
        conversation_id: conversationId,
        message_id: messageId,
        direction: 'outbound',
        from_number: cloudConv.account.phone_number,
        to_number: phoneNumber,
        message_type: 'template',
        content: {
          template: { name: templateName, language: { code: language }, components },
          rendered: renderedBody,
        },
        text_body: renderedBody,
        status: 'sent',
        timestamp: new Date().toISOString(),
      }, { onConflict: 'message_id' })
      .select()
      .maybeSingle()

    await supabase.from('whatsapp_cloud_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: renderedBody.substring(0, 100),
      last_message_direction: 'outbound',
    }).eq('id', conversationId)

    await supabase
      .from('whatsapp_templates')
      .update({
        use_count: (template.use_count ?? 0) + 1,
        times_sent: (template.times_sent ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', template.id)

    return NextResponse.json({
      message: {
        id: saved?.id,
        conversation_id: conversationId,
        direction: 'outbound',
        message_type: 'template',
        content: { rendered: renderedBody },
        status: 'sent',
        created_at: saved?.created_at,
      },
      success: true,
    }, { headers: NO_CACHE_HEADERS })
  } catch (e: any) {
    console.error('[send-template] unhandled:', e)
    return NextResponse.json(
      { error: 'Internal server error', details: e?.message ?? String(e) },
      { status: 500, headers: NO_CACHE_HEADERS },
    )
  }
}
