// =====================================================
// SIMULADOR DE WEBHOOK WHATSAPP CLOUD (Fase 2a / P1.7)
// Testa o fluxo da IA Cloud sem WhatsApp real.
// /api/ai/test/cloud-webhook
//
// SEMPRE contra tabelas CLOUD (whatsapp_cloud_conversations /
// whatsapp_cloud_messages / whatsapp_contacts). NÃO usa as tabelas legadas
// (whatsapp_instances / whatsapp_conversations / whatsapp_messages) nem o
// simulador legado api/ai/test/webhook.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { maybeRunAgentForCloudConversation } from '@/lib/ai/cloud-runner';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'Simulador de Webhook WhatsApp Cloud',
    description:
      'Testa a IA Cloud (cloud-runner) sem enviar/receber do WhatsApp real',
    usage: {
      method: 'POST',
      body: {
        accountId: 'uuid da whatsapp_business_accounts (obrigatório)',
        phoneNumber: '5511999999999 (obrigatório)',
        message: 'Olá, preciso de ajuda (obrigatório)',
        skipSend: 'true => gera+traça sem chamar sendText (opcional, default false)',
        immediate:
          'true (default) => roda SÍNCRONO via cloud-runner, SEM debounce/QStash. ' +
          'Mantém o E2E offline funcionando independentemente da fila.',
        skipDelays:
          'true (default) => pula typing/reply_delay/intervalo entre bolhas no ' +
          'envio humanizado (E2E rápido). O split em bolhas continua ativo.',
        contactName: 'Nome do contato (opcional)',
      },
    },
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      accountId,
      phoneNumber,
      message,
      skipSend = false,
      // immediate (default true): caminho SÍNCRONO de teste — roda o runner
      // direto, SEM passar pelo debounce/QStash. Mantém o E2E offline.
      immediate = true,
      // skipDelays (default true): pula os delays humanizados no envio p/ E2E
      // rápido; o split em bolhas e a persistência continuam ocorrendo.
      skipDelays = true,
      contactName = 'Teste Simulador Cloud',
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Campo obrigatório: accountId (whatsapp_business_accounts.id)' },
        { status: 400 },
      );
    }
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Campo obrigatório: phoneNumber (ex: 5511999999999)' },
        { status: 400 },
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: 'Campo obrigatório: message' },
        { status: 400 },
      );
    }

    // ---------- 1. Account Cloud ----------
    const { data: account } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: 'whatsapp_business_accounts não encontrado para accountId' },
        { status: 404 },
      );
    }

    const organizationId = account.organization_id;

    // ---------- 2. Contato Cloud ----------
    let { data: contact } = await supabaseAdmin
      .from('whatsapp_contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (!contact) {
      const { data: newContact, error: contactErr } = await supabaseAdmin
        .from('whatsapp_contacts')
        .insert({
          organization_id: organizationId,
          phone_number: phoneNumber,
          name: contactName,
          profile_name: contactName,
        })
        .select()
        .maybeSingle();

      if (contactErr) {
        return NextResponse.json(
          { error: 'Erro ao criar contato', details: contactErr.message },
          { status: 500 },
        );
      }
      contact = newContact;
    }

    // ---------- 3. Conversa Cloud ----------
    let { data: conversation } = await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .select('*')
      .eq('waba_id', account.id)
      .eq('wa_id', phoneNumber)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from('whatsapp_cloud_conversations')
        .insert({
          organization_id: organizationId,
          store_id: account.store_id || null,
          waba_id: account.id,
          contact_id: contact?.id,
          wa_id: phoneNumber,
          chat_id: `${account.phone_number}-${phoneNumber}`,
          contact_name: contact?.name || phoneNumber,
          contact_phone: phoneNumber,
          status: 'open',
          ai_enabled: true,
          is_window_open: true,
          window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .maybeSingle();

      if (convErr) {
        return NextResponse.json(
          { error: 'Erro ao criar conversa Cloud', details: convErr.message },
          { status: 500 },
        );
      }
      conversation = newConv;
    }

    // ---------- 4. Inbound simulado ----------
    const simulatedMessageId = `SIM_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await supabaseAdmin.from('whatsapp_cloud_messages').insert({
      organization_id: organizationId,
      store_id: conversation.store_id || account.store_id || null,
      waba_id: account.id,
      conversation_id: conversation.id,
      message_id: simulatedMessageId,
      direction: 'inbound',
      from_number: phoneNumber,
      to_number: account.phone_number,
      message_type: 'text',
      content: { text: { body: message } },
      text_body: message,
      status: 'received',
      timestamp: new Date().toISOString(),
    });

    // ---------- 5. Rodar IA ----------
    // immediate=true (default): SÍNCRONO via runner — sem debounce/QStash.
    // immediate=false: exercita o caminho de DEBOUNCE (marca pending + enfileira
    //   no QStash). Útil p/ validar o agendamento; a resposta vem do worker.
    let runResult: any;
    if (immediate) {
      runResult = await maybeRunAgentForCloudConversation({
        account,
        conversation,
        contact,
        text: message,
        inboundMessageId: simulatedMessageId,
        messageType: 'text',
        phoneNumber,
        skipSend: !!skipSend,
        skipDelays: !!skipDelays,
      });
    } else {
      const debounceSeconds = Number(process.env.WHATSAPP_AI_DEBOUNCE_SECONDS) || 8;
      const debounceUntil = new Date(Date.now() + debounceSeconds * 1000).toISOString();
      await supabaseAdmin
        .from('whatsapp_cloud_conversations')
        .update({ ai_debounce_until: debounceUntil, ai_pending: true })
        .eq('id', conversation.id);
      const { enqueueWhatsAppAiRespond } = await import('@/lib/queue');
      const qMessageId = await enqueueWhatsAppAiRespond(
        {
          conversationId: conversation.id,
          accountId: account.id,
          organizationId,
        },
        debounceSeconds,
      );
      runResult = {
        replied: false,
        transferred: false,
        skipped: 'debounce_scheduled',
        debounce: { seconds: debounceSeconds, until: debounceUntil, qMessageId },
      };
    }

    return NextResponse.json({
      success: true,
      simulation: true,
      immediate: !!immediate,
      skipSend: !!skipSend,
      skipDelays: !!skipDelays,
      replied: runResult.replied,
      response: runResult.response,
      transferred: runResult.transferred,
      traceId: runResult.traceId,
      agentId: runResult.agentId,
      skipped: runResult.skipped,
      error: runResult.error,
      context: {
        organizationId,
        accountId: account.id,
        contactId: contact?.id,
        conversationId: conversation.id,
        messageId: simulatedMessageId,
      },
      timing: { totalTimeMs: Date.now() - startTime },
    });
  } catch (error: any) {
    console.error('[cloud-webhook-sim] Erro:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
