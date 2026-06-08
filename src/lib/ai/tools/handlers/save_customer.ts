// =====================================================
// TOOL: save_customer — upsert de contato (Fase 2b)
// =====================================================
// Salva/atualiza dados do cliente em `contacts`, escopado por organização via
// wrapper RLS (tools/db.ts). `contacts` NÃO tem UNIQUE em (organization_id,
// phone), mas TEM unique em (organization_id, email) WHERE email IS NOT NULL.
// Por isso fazemos merge manual (select -> update | insert) localizando o
// contato por contactId, depois por phone, depois por email — evitando violar
// o unique de email — e garantindo MERGE de tags/custom_fields (não sobrescreve
// cego).
//
// Mapeamento de schema: `contacts` usa first_name/last_name (full_name é
// coluna GERADA). O nome recebido vai para first_name; tags = TEXT[],
// custom_fields = JSONB.

import type { Tool, ToolContext, ToolResultPayload } from '../types'
import { orgSelect, orgUpdate, orgInsert } from '../db'

function uniqStrings(arr: any[]): string[] {
  return Array.from(
    new Set(arr.filter((x) => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())),
  )
}

export const saveCustomerTool: Tool = {
  name: 'save_customer',
  description:
    'Salva ou atualiza os dados de contato do cliente no CRM (nome, email, ' +
    'tags, campos personalizados). Use quando o cliente informar nome, email ' +
    'ou outra informação de cadastro relevante. Não invente dados.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome do cliente.' },
      email: { type: 'string', description: 'Email do cliente.' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Etiquetas a adicionar ao contato (serão mescladas com as existentes).',
      },
      custom_fields: {
        type: 'object',
        description: 'Campos personalizados (chave-valor) a mesclar no contato.',
        additionalProperties: true,
      },
    },
    required: [],
  },
  async handler(
    ctx: ToolContext,
    args: { name?: string; email?: string; tags?: string[]; custom_fields?: Record<string, any> },
  ): Promise<ToolResultPayload> {
    const phone = (ctx.phone || '').trim()
    if (!phone && !ctx.contactId) {
      return { ok: false, error: 'sem telefone nem contactId para identificar o contato' }
    }

    try {
      // Localizar contato existente: por contactId (preferido) ou por phone.
      let existing: any = null
      if (ctx.contactId) {
        const { data } = await orgSelect('contacts', ctx.organizationId, '*')
          .eq('id', ctx.contactId)
          .maybeSingle()
        existing = data
      }
      if (!existing && phone) {
        const { data } = await orgSelect('contacts', ctx.organizationId, '*')
          .eq('phone', phone)
          .limit(1)
          .maybeSingle()
        existing = data
      }
      // Por email — cobre o unique (organization_id, email) e evita que o
      // insert quebre quando o email já pertence a outro contato da org.
      const emailNorm = (args.email || '').trim().toLowerCase()
      if (!existing && emailNorm) {
        const { data } = await orgSelect('contacts', ctx.organizationId, '*')
          .eq('email', emailNorm)
          .limit(1)
          .maybeSingle()
        existing = data
      }

      // Construir patch com merge.
      const patch: Record<string, any> = { updated_at: new Date().toISOString() }

      if (args.name && args.name.trim()) {
        // contacts não tem `name`; usar first_name.
        patch.first_name = args.name.trim()
      }
      if (emailNorm) {
        patch.email = emailNorm
      }

      if (Array.isArray(args.tags) && args.tags.length > 0) {
        const merged = uniqStrings([...(existing?.tags || []), ...args.tags])
        patch.tags = merged
      }

      if (args.custom_fields && typeof args.custom_fields === 'object') {
        patch.custom_fields = { ...(existing?.custom_fields || {}), ...args.custom_fields }
      }

      if (existing) {
        const { data, error } = await orgUpdate('contacts', ctx.organizationId, patch)
          .eq('id', existing.id)
          .select('id')
          .maybeSingle()
        if (error) return { ok: false, error: error.message }
        return { ok: true, data: { contact_id: data?.id || existing.id, created: false } }
      }

      // Inserir novo.
      const insertRow: Record<string, any> = {
        phone: phone || null,
        source: 'ai_agent',
        ...patch,
      }
      // tags/custom_fields default vazios se não vieram.
      if (!insertRow.tags) insertRow.tags = uniqStrings(args.tags || [])
      if (!insertRow.custom_fields) insertRow.custom_fields = args.custom_fields || {}

      const { data, error } = await orgInsert('contacts', ctx.organizationId, insertRow)
        .select('id')
        .maybeSingle()
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: { contact_id: data?.id, created: true } }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'erro ao salvar contato' }
    }
  },
}
