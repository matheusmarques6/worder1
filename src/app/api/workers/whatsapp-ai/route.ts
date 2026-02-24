import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/queue';
import { processWebhookWithAI } from '@/lib/ai/webhook-processor';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

// Config para Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 60s para processamento de IA

/**
 * Worker para processar mensagens WhatsApp com IA
 * Recebe jobs da fila QStash para processamento durável
 */
export async function POST(request: NextRequest) {
  console.log('[Worker/WhatsApp-AI] 📬 Recebido job');

  try {
    // Verificar assinatura do QStash
    const { isValid, body } = await verifyQStashSignature(request);

    if (!isValid) {
      console.error('[Worker/WhatsApp-AI] ❌ Assinatura inválida');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { type, data } = body;

    if (type !== 'whatsapp_ai') {
      console.error('[Worker/WhatsApp-AI] ❌ Tipo inválido:', type);
      return NextResponse.json({ error: 'Invalid job type' }, { status: 400 });
    }

    const {
      organizationId,
      conversationId,
      contactId,
      instanceId,
      instanceName,
      phoneNumber,
      message,
      messageId,
      contactName,
    } = data;

    console.log(`[Worker/WhatsApp-AI] 🤖 Processando: ${phoneNumber} -> "${message.substring(0, 50)}..."`);

    // Verificar idempotência - não processar mensagem duplicada
    if (messageId) {
      const { data: existingLog } = await supabaseAdmin
        .from('ai_message_logs')
        .select('id')
        .eq('message_id', messageId)
        .single();

      if (existingLog) {
        console.log('[Worker/WhatsApp-AI] ⏭️ Mensagem já processada:', messageId);
        return NextResponse.json({ 
          skipped: true, 
          reason: 'already_processed',
          messageId 
        });
      }
    }

    // Processar com IA
    const result = await processWebhookWithAI({
      organizationId,
      conversationId,
      contactId,
      instanceId,
      instanceName,
      phoneNumber,
      message,
      messageId,
      contactName,
    });

    // Registrar log de processamento para idempotência
    if (messageId) {
      try {
        const { error: logError } = await supabaseAdmin
          .from('ai_message_logs')
          .insert({
            message_id: messageId,
            conversation_id: conversationId,
            organization_id: organizationId,
            processed: result.processed,
            replied: result.replied,
            transferred: result.transferred,
            agent_id: result.agentId,
            error: result.error,
          });
        
        if (logError) {
          console.warn('[Worker/WhatsApp-AI] ⚠️ Erro ao registrar log:', logError);
        }
      } catch (err) {
        // Não falhar se o log não puder ser inserido
        console.warn('[Worker/WhatsApp-AI] ⚠️ Erro ao registrar log:', err);
      }
    }

    console.log('[Worker/WhatsApp-AI] ✅ Processado:', {
      processed: result.processed,
      replied: result.replied,
      transferred: result.transferred,
      agentName: result.agentName,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error: any) {
    console.error('[Worker/WhatsApp-AI] ❌ Erro:', error);
    
    // Retornar 200 para não retry infinito em erros de lógica
    // QStash só faz retry em 4xx/5xx
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 200 });
  }
}

/**
 * GET - Health check
 */
export async function GET() {
  return NextResponse.json({
    status: 'Worker WhatsApp AI ativo',
    version: '1.0',
    timestamp: new Date().toISOString(),
  });
}
