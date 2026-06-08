// =====================================================
// TOOL: save_interests — registra interesse do cliente (Fase 2c)
// =====================================================
// Registra o interesse do cliente em produto(s)/assunto(s). Faz DUAS coisas,
// ambas idempotentes e escopadas por org via wrapper RLS (tools/db.ts):
//   1) Append em `contacts.tags` (TEXT[]) — merge sem duplicar, prefixando
//      cada interesse com "interesse:" para distinguir de outras tags.
//   2) Se houver produto identificado (product_id ou product_name), insere em
//      `whatsapp_product_interests` (colunas REAIS: organization_id, contact_id,
//      phone, product_id NOT NULL, variant_id, product_title, notified...).
//      Existe UNIQUE PARCIAL sobre expressão (organization_id, contact_id,
//      product_id, COALESCE(variant_id,'')) WHERE contact_id IS NOT NULL — como
//      ON CONFLICT não casa com índice parcial/expressão, usamos SELECT-then-
//      INSERT para idempotência.
//
// Observação de schema: `whatsapp_product_interests.product_id` é NOT NULL. Sem
// product_id não inserimos linha nessa tabela (só gravamos a tag). Quando só há
// product_name, usamos um id sintético derivado do nome para satisfazer o NOT
// NULL e manter a idempotência por nome.

import type { Tool, ToolContext, ToolResultPayload } from '../types'
import { orgSelect, orgUpdate, orgInsert } from '../db'

function uniqStrings(arr: any[]): string[] {
  return Array.from(
    new Set(arr.filter((x) => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())),
  )
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

export const saveInterestsTool: Tool = {
  name: 'save_interests',
  description:
    'Registra o interesse do cliente em um ou mais produtos/assuntos para ' +
    'remarketing e contexto futuro. Use quando o cliente demonstrar interesse ' +
    'em comprar algo, pedir para ser avisado quando um produto voltar ao ' +
    'estoque, ou mencionar produtos/categorias que deseja. Não invente ' +
    'interesses; registre apenas o que o cliente expressou.',
  inputSchema: {
    type: 'object',
    properties: {
      interests: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Lista de interesses do cliente (produtos, categorias ou assuntos), ' +
          'em texto curto. Ex.: ["tênis de corrida", "promoções de verão"].',
      },
      product_name: {
        type: 'string',
        description: 'Nome do produto específico de interesse, se houver.',
      },
      product_id: {
        type: 'string',
        description:
          'ID do produto (Shopify) de interesse, se conhecido (ex.: vindo de product_lookup).',
      },
    },
    required: ['interests'],
  },
  async handler(
    ctx: ToolContext,
    args: { interests?: string[]; product_name?: string; product_id?: string },
  ): Promise<ToolResultPayload> {
    const interests = uniqStrings(args?.interests || [])
    const productName = (args?.product_name || '').trim()
    const productId = (args?.product_id || '').trim()

    if (interests.length === 0 && !productName && !productId) {
      return { ok: false, error: 'nenhum interesse informado' }
    }

    if (!ctx.contactId && !ctx.phone) {
      return { ok: false, error: 'sem contactId nem telefone para associar o interesse' }
    }

    const out: { tags_added?: string[]; product_interest_saved?: boolean } = {}

    try {
      // ---------- 1) Append em contacts.tags ----------
      // Localizar contato (por contactId preferencialmente, senão por phone).
      let contact: any = null
      if (ctx.contactId) {
        const { data } = await orgSelect('contacts', ctx.organizationId, 'id, tags')
          .eq('id', ctx.contactId)
          .maybeSingle()
        contact = data
      }
      if (!contact && ctx.phone) {
        const { data } = await orgSelect('contacts', ctx.organizationId, 'id, tags')
          .eq('phone', ctx.phone.trim())
          .limit(1)
          .maybeSingle()
        contact = data
      }

      const interestTags = uniqStrings(
        [...interests, productName].map((i) => (i ? `interesse:${i}` : '')),
      )

      if (contact && interestTags.length > 0) {
        const merged = uniqStrings([...(contact.tags || []), ...interestTags])
        // Só atualiza se houve mudança real (idempotência).
        const before = uniqStrings(contact.tags || [])
        if (merged.length !== before.length) {
          const { error } = await orgUpdate('contacts', ctx.organizationId, {
            tags: merged,
            updated_at: new Date().toISOString(),
          }).eq('id', contact.id)
          if (error) {
            console.error('[save_interests] falha ao atualizar tags:', error.message)
          } else {
            out.tags_added = interestTags
          }
        } else {
          out.tags_added = []
        }
      }

      // ---------- 2) whatsapp_product_interests (se houver produto) ----------
      // product_id é NOT NULL nessa tabela. Se só temos nome, derivamos um id
      // sintético estável a partir do nome para satisfazer o NOT NULL e manter
      // idempotência por nome.
      const effectiveProductId =
        productId || (productName ? `name:${slugify(productName)}` : '')

      if (effectiveProductId && ctx.contactId) {
        // Idempotência via SELECT-then-INSERT em vez de upsert: o índice único é
        // PARCIAL sobre EXPRESSÃO — UNIQUE (organization_id, contact_id,
        // product_id, COALESCE(variant_id,'')) WHERE contact_id IS NOT NULL — e
        // o ON CONFLICT do PostgREST não casa com uma lista simples de colunas
        // (falharia com 42P10). Como variant_id é sempre NULL aqui, checamos a
        // existência (variant_id IS NULL) antes de inserir.
        const { data: existing } = await orgSelect(
          'whatsapp_product_interests',
          ctx.organizationId,
          'id',
        )
          .eq('contact_id', ctx.contactId)
          .eq('product_id', effectiveProductId)
          .is('variant_id', null)
          .limit(1)
          .maybeSingle()

        if (existing) {
          out.product_interest_saved = true
        } else {
          const { error } = await orgInsert('whatsapp_product_interests', ctx.organizationId, {
            contact_id: ctx.contactId,
            phone: ctx.phone || null,
            product_id: effectiveProductId,
            product_title: productName || null,
          })
          if (error) {
            // Não falhar a tool por causa da tabela de apoio; a tag já foi gravada.
            console.error('[save_interests] falha em whatsapp_product_interests:', error.message)
          } else {
            out.product_interest_saved = true
          }
        }
      }

      return { ok: true, data: out }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'erro ao salvar interesse' }
    }
  },
}
