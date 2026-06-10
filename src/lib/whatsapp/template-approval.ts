// =============================================
// P0 — Validação de template APPROVED.
// Política: criar/agendar campanha com template pendente é permitido,
// mas ENVIAR é bloqueado (send route + startCampaign — defesa em profundidade).
// O status no banco mistura cases: sync/webhook gravam UPPERCASE
// ('APPROVED'), o schema legado tem default 'pending' minúsculo —
// comparação SEMPRE case-insensitive.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

export function isTemplateApproved(status: string | null | undefined): boolean {
  return (status || '').toUpperCase() === 'APPROVED'
}

export interface TemplateApprovalCheck {
  ok: boolean
  reason?: string
  template?: { name: string; status: string }
}

/**
 * Resolve o template da campanha (por template_id; fallback por
 * name + organization_id) e exige status APPROVED.
 */
export async function ensureCampaignTemplateApproved(campaign: {
  template_id?: string | null
  template_name?: string | null
  organization_id: string
}): Promise<TemplateApprovalCheck> {
  let row: { status: string; name: string } | null = null

  if (campaign.template_id) {
    const { data } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('status, name')
      .eq('id', campaign.template_id)
      .maybeSingle()
    row = data
  }

  if (!row && campaign.template_name) {
    const { data } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('status, name')
      .eq('organization_id', campaign.organization_id)
      .eq('name', campaign.template_name)
      .maybeSingle()
    row = data
  }

  if (!row) {
    return { ok: false, reason: 'Template da campanha não encontrado. Sincronize os templates antes de enviar.' }
  }

  if (!isTemplateApproved(row.status)) {
    wlog.warn('whatsapp.campaign.template_not_approved', {
      organization_id: campaign.organization_id,
      template_name: row.name,
      template_status: row.status,
    })
    return {
      ok: false,
      reason: `Template "${row.name}" não está aprovado pela Meta (status: ${row.status}). Aguarde a aprovação para enviar.`,
      template: row,
    }
  }

  return { ok: true, template: row }
}
