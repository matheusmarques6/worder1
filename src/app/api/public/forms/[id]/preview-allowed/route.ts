// =============================================
// GET /api/public/forms/{id}/preview-allowed?vid=...&domain=...
//
// O gate de elegibilidade que só o servidor consegue responder. O runtime
// chama antes de renderizar quando o formulário tem pelo menos um destes:
//
//   behavior.visibility.hideFromSubscribers = true
//       → já é inscrito, está suprimido ou já enviou este formulário?
//   behavior.audienceTargeting.mode = 'include' | 'exclude'
//       → está em algum dos segmentos/listas escolhidos?
//
// Entradas:
//   id     — UUID do formulário (path)
//   vid    — id de visitante (cookie __worder_id / localStorage), token
//            longo e aleatório emitido por nós
//   domain — domínio da loja (informativo; a org vem do formulário)
//
// Saída:
//   { allowed: true }
//   { allowed: false, reason: '...' }   — não renderizar
//
// Regras de falha: erro de consulta → allowed=true (um lookup instável não
// pode esconder um popup ativo). A exceção é o modo "somente quem está no
// segmento" sem visitante identificado: aí a resposta certa é não mostrar,
// porque desconhecido não pertence a segmento nenhum.
//
// Nunca devolve PII nem o motivo detalhado da associação (qual segmento).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { audienceBlockReason, contactIdForVisitor, readAudienceTargeting } from '@/lib/popups/targeting';

export const dynamic = 'force-dynamic';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // 10 minutos — pula a ida ao servidor a cada navegação, e uma inscrição
    // ou entrada em segmento nova propaga rápido o bastante.
    'Cache-Control': 'public, max-age=600, s-maxage=600',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors() });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const headers = cors();
  const allow = () => NextResponse.json({ allowed: true }, { headers });
  const deny = (reason: string) => NextResponse.json({ allowed: false, reason }, { headers });

  try {
    const { searchParams } = req.nextUrl;
    const vid = (searchParams.get('vid') || '').trim();

    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, organization_id, status, behavior')
      .eq('id', params.id)
      .maybeSingle();

    if (!form || form.status !== 'published') return allow();

    const hideFromSubscribers = !!form.behavior?.visibility?.hideFromSubscribers;
    const audience = readAudienceTargeting(form.behavior);
    if (!hideFromSubscribers && audience.mode === 'off') return allow();

    const orgId = form.organization_id as string;

    // Sem id de visitante não há o que consultar. Só o modo "somente quem
    // está no segmento" muda a resposta: desconhecido não está em lugar
    // nenhum.
    if (!vid) return audience.mode === 'include' ? deny('not_in_audience') : allow();

    const contactId = await contactIdForVisitor(supabaseAdmin, orgId, vid);

    if (hideFromSubscribers && contactId) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('email_consent, status')
        .eq('id', contactId)
        .eq('organization_id', orgId)
        .maybeSingle();
      // email_consent é texto e acumulou formatos: 'true'/'false' da
      // migração booleana, 'subscribed'/'unsubscribed' depois, e 'pending'
      // do double opt-in. Tudo que não é um "não" explícito conta como
      // inscrito, para não mostrar de novo a quem já está em alguma lista.
      const consent = String(contact?.email_consent || '').toLowerCase();
      const isSubscriber = consent === 'true' || consent === 'subscribed' || consent === 'pending';
      if (isSubscriber) return deny(consent === 'pending' ? 'awaiting_confirmation' : 'subscribed');

      // Contato suprimido (bounce, reclamação, descadastro) também não vê
      // um popup de "entre na lista" — pareceria quebrado.
      const badStatus = new Set(['bounced', 'complained', 'unsubscribed', 'invalid']);
      if (contact?.status && badStatus.has(String(contact.status).toLowerCase())) return deny('suppressed');

      // Já enviou ESTE formulário antes, em qualquer dispositivo?
      const { data: prior } = await supabaseAdmin
        .from('crm_form_submissions')
        .select('id')
        .eq('form_id', params.id)
        .eq('contact_id', contactId)
        .limit(1)
        .maybeSingle();
      if (prior) return deny('already_submitted');
    }

    const audienceReason = await audienceBlockReason(supabaseAdmin, orgId, contactId, audience);
    if (audienceReason) return deny(audienceReason);

    return allow();
  } catch (err: any) {
    // Falha aberta: um erro de consulta nunca esconde um popup ativo.
    console.warn('[preview-allowed] error:', err?.message || err);
    return allow();
  }
}
