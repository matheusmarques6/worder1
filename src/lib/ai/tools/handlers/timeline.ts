// =====================================================
// TOOL: timeline — consultar / registrar atividade do contato (Fase 2c)
// =====================================================
// Lê ou registra atividades na timeline do contato (`contact_activities`),
// escopado por org + contact_id via wrapper RLS (tools/db.ts).
//
// Schema REAL de contact_activities:
//   contact_id UUID NOT NULL, organization_id UUID NOT NULL,
//   user_id UUID NULL, type VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL,
//   description TEXT, metadata JSONB, created_at, updated_at.
// NÃO existe coluna `created_by_name`; gravamos a autoria ('AI Agent') dentro
// de metadata.created_by_name + metadata.source='ai_agent'.
//
// Tipos de atividade ACEITOS no `add` (alinhados ao comentário canônico da
// tabela e ao uso na 2b): 'note', 'whatsapp', 'order', 'email', 'call',
// 'meeting', 'visit', 'custom', 'agent_assigned'. Valores fora dessa lista
// são normalizados para 'note'.

import type { Tool, ToolContext, ToolResultPayload } from '../types'
import { orgSelect, orgInsert } from '../db'

const ALLOWED_TYPES = new Set([
  'note',
  'whatsapp',
  'order',
  'email',
  'call',
  'meeting',
  'visit',
  'custom',
  'agent_assigned',
])

const READ_LIMIT = 10

export const timelineTool: Tool = {
  name: 'timeline',
  description:
    'Consulta (action="read") ou registra (action="add") atividades na ' +
    'timeline/histórico do contato. Use "read" para entender o histórico do ' +
    'cliente (pedidos, notas, interações anteriores) antes de responder. Use ' +
    '"add" para registrar uma observação relevante da conversa atual. ' +
    'Tipos aceitos em add: note, whatsapp, order, email, call, meeting, ' +
    'visit, custom, agent_assigned (padrão: note).',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'add'],
        description: 'read = consultar últimas atividades; add = registrar nova atividade.',
      },
      type: {
        type: 'string',
        description: 'Tipo da atividade (apenas para add). Padrão: note.',
      },
      title: {
        type: 'string',
        description: 'Título curto da atividade (obrigatório para add).',
      },
      description: {
        type: 'string',
        description: 'Detalhe/descrição da atividade (opcional, apenas para add).',
      },
    },
    required: ['action'],
  },
  async handler(
    ctx: ToolContext,
    args: { action?: 'read' | 'add'; type?: string; title?: string; description?: string },
  ): Promise<ToolResultPayload> {
    const action = args?.action

    if (!ctx.contactId) {
      return { ok: false, error: 'sem contactId — não há contato para consultar/registrar timeline' }
    }

    if (action !== 'read' && action !== 'add') {
      return { ok: false, error: 'action inválida: use "read" ou "add"' }
    }

    try {
      if (action === 'read') {
        const { data, error } = await orgSelect(
          'contact_activities',
          ctx.organizationId,
          'id, type, title, description, metadata, created_at',
        )
          .eq('contact_id', ctx.contactId)
          .order('created_at', { ascending: false })
          .limit(READ_LIMIT)

        if (error) return { ok: false, error: error.message }

        const activities = (data || []).map((a: any) => ({
          type: a.type,
          title: a.title,
          description: a.description || undefined,
          created_at: a.created_at,
        }))

        return {
          ok: true,
          data: { count: activities.length, activities },
        }
      }

      // action === 'add'
      const title = (args?.title || '').trim()
      if (!title) {
        return { ok: false, error: 'title é obrigatório para add' }
      }

      const rawType = (args?.type || 'note').trim().toLowerCase()
      const type = ALLOWED_TYPES.has(rawType) ? rawType : 'note'
      const description = (args?.description || '').trim() || null

      const { data, error } = await orgInsert('contact_activities', ctx.organizationId, {
        contact_id: ctx.contactId,
        type,
        title,
        description,
        metadata: {
          source: 'ai_agent',
          created_by_name: 'AI Agent',
          agent_id: ctx.agentId,
          conversation_id: ctx.conversationId,
        },
      })
        .select('id')
        .maybeSingle()

      if (error) return { ok: false, error: error.message }

      return { ok: true, data: { added: true, activity_id: data?.id, type } }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'erro na timeline' }
    }
  },
}
