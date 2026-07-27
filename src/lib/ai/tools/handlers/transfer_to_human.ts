// =====================================================
// TOOL: transfer_to_human — versão Cloud (Fase 2b)
// =====================================================
// Desliga a IA na conversa (whatsapp_cloud_conversations.ai_enabled=false) e
// registra um RESUMO/motivo para o humano em contact_activities (type
// 'agent_assigned'). IDEMPOTENTE: se a conversa já está transferida/desativada,
// retorna ok sem duplicar. Retorna control:{transfer,stop} para encerrar o
// tool-loop imediatamente.
//
// NÃO usa conversation-service.transferConversation (legado).
// Tudo escopado por org via wrapper RLS (tools/db.ts).

import type { Tool, ToolContext, ToolResultPayload } from '../types'
import { orgSelect, orgUpdate, orgInsert } from '../db'

export const transferToHumanTool: Tool = {
  name: 'transfer_to_human',
  description:
    'Transfere o atendimento para um humano e DESLIGA a IA nesta conversa. ' +
    'Use quando o cliente pedir explicitamente falar com um atendente, quando ' +
    'estiver insatisfeito/irritado, ou quando você não conseguir resolver. ' +
    'Forneça SEMPRE um resumo da conversa e o motivo da transferência.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Motivo curto da transferência (ex.: "cliente pediu humano").',
      },
      summary: {
        type: 'string',
        description: 'Resumo da conversa para o atendente humano dar continuidade.',
      },
    },
    required: ['reason'],
  },
  async handler(
    ctx: ToolContext,
    args: { reason?: string; summary?: string },
  ): Promise<ToolResultPayload> {
    const reason = (args?.reason || 'transfer_requested').trim()
    const summary = (args?.summary || '').trim()

    try {
      // Estado atual da conversa (idempotência).
      const { data: conv } = await orgSelect(
        'whatsapp_cloud_conversations',
        ctx.organizationId,
        'id, ai_enabled, ai_disabled_reason',
      )
        .eq('id', ctx.conversationId)
        .maybeSingle()

      const convRow = conv as { ai_enabled?: boolean; ai_disabled_reason?: string } | null
      const alreadyTransferred =
        convRow && (convRow.ai_enabled === false || !!convRow.ai_disabled_reason)

      if (alreadyTransferred) {
        // Já transferida/desativada: não duplicar atividade nem update.
        return {
          ok: true,
          data: { transferred: true, already: true },
          control: { transfer: true, stop: true },
        }
      }

      // Desligar a IA na conversa. NÃO setamos assigned_agent_id aqui: a
      // atribuição a um humano usa a coluna `assigned_to` (profiles) via o
      // fluxo de inbox; não há humano definido no momento da transferência, e
      // gravar o ID do agente de IA aqui confundiria a UI. A conversa fica na
      // fila não-atribuída para um humano assumir.
      // NÃO setamos ai_transferred_at aqui de propósito: o chamador
      // (cloud-runner, bloco pós-processMessage de was_transferred) já
      // re-grava a conversa e carimba ai_transferred_at (cooldown). Manter
      // essa omissão intencional — não adicionar o campo aqui num refactor
      // futuro sem revisar esse fluxo duplo de escrita.
      const { error: updErr } = await orgUpdate(
        'whatsapp_cloud_conversations',
        ctx.organizationId,
        {
          ai_enabled: false,
          ai_disabled_at: new Date().toISOString(),
          ai_disabled_reason: 'transferred_to_human',
        },
      ).eq('id', ctx.conversationId)

      if (updErr) {
        return { ok: false, error: updErr.message }
      }

      // Registrar resumo/motivo em contact_activities (se houver contato).
      // contact_activities exige contact_id NOT NULL e title NOT NULL.
      if (ctx.contactId) {
        const description = summary
          ? `Motivo: ${reason}\n\nResumo: ${summary}`
          : `Motivo: ${reason}`

        const { error: actErr } = await orgInsert('contact_activities', ctx.organizationId, {
          contact_id: ctx.contactId,
          type: 'agent_assigned',
          title: 'Transferido para atendimento humano (IA)',
          description,
          metadata: {
            source: 'ai_agent',
            agent_id: ctx.agentId,
            conversation_id: ctx.conversationId,
            reason,
          },
        })
        if (actErr) {
          // Não falhar a transferência por causa do log de atividade.
          console.error('[transfer_to_human] falha ao registrar atividade:', actErr.message)
        }
      } else {
        console.warn(
          '[transfer_to_human] sem contactId — resumo não registrado em contact_activities',
        )
      }

      return {
        ok: true,
        data: { transferred: true, reason },
        control: { transfer: true, stop: true },
      }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'erro ao transferir' }
    }
  },
}
