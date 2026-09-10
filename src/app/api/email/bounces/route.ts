// =============================================
// GET  /api/email/bounces  — endereços que voltaram ou denunciaram
// PATCH /api/email/bounces — reativar endereços (tirar da supressão)
//
// A lista vinha de `contacts.status IN ('bounced','complained','invalid')`
// — e `contacts.status` NUNCA existiu neste banco. O PostgREST recusava a
// consulta, a rota devolvia 500 e a tela de entregabilidade mostrava
// "nenhum bounce" para uma organização que tivesse mil. A coluna que
// existe é `contacts.suppressed` (booleana), e quem sabe o MOTIVO e a
// DATA de cada bounce é `email_sends` — é de lá que a lista sai agora.
//
// Um endereço pode voltar várias vezes; a lista é por EVENTO, do mais
// recente para o mais antigo, que é o que a tela mostra ("últimos
// bounces"). O nome do contato e o estado atual de supressão vêm de uma
// segunda consulta, presa à mesma organização.
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/** Os dois estados que `email_sends` registra. */
const ESTADOS = ['bounced', 'complained'] as const;

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get('store_id') || searchParams.get('storeId');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 100);
  const tipo = searchParams.get('type');
  const estados = ESTADOS.includes(tipo as any) ? [tipo as string] : [...ESTADOS];

  try {
    let query = supabaseAdmin
      .from('email_sends')
      .select('id, contact_id, email, to_email, status, bounced_at, complained_at, bounce_type, bounce_message, campaign_id, created_at, store_id', { count: 'exact' })
      .eq('organization_id', organizationId)
      .in('status', estados)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (storeId) query = query.eq('store_id', storeId);

    const { data: sends, count, error } = await query;
    if (error) {
      console.error('[Bounces] falha ao listar:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Nome e estado atual de supressão, sempre dentro da organização.
    const contactIds = [...new Set((sends || []).map((s: any) => s.contact_id).filter(Boolean))];
    const porContato = new Map<string, any>();
    if (contactIds.length > 0) {
      const { data: contatos, error: cErr } = await supabaseAdmin
        .from('contacts')
        .select('id, email, first_name, last_name, suppressed, email_consent, updated_at')
        .eq('organization_id', organizationId)
        .in('id', contactIds);
      if (cErr) console.error('[Bounces] contatos indisponíveis:', cErr.message);
      for (const c of (contatos || []) as any[]) porContato.set(c.id, c);
    }

    const contacts = (sends || []).map((s: any) => {
      const c = s.contact_id ? porContato.get(s.contact_id) : null;
      return {
        // A tela usa `id` como chave da linha; aqui a linha é o evento.
        id: s.id,
        contact_id: s.contact_id || null,
        email: c?.email || s.email || s.to_email || null,
        first_name: c?.first_name || null,
        last_name: c?.last_name || null,
        status: s.status,
        suppressed: c?.suppressed === true,
        email_consent: c?.email_consent ?? null,
        updated_at: s.bounced_at || s.complained_at || s.created_at,
        bounce_info: {
          bounce_type: s.bounce_type || s.status,
          bounced_at: s.bounced_at || s.complained_at || null,
          message: s.bounce_message || null,
          campaign_id: s.campaign_id || null,
        },
      };
    });

    return NextResponse.json({
      contacts,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    console.error('[Bounces] erro:', error?.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: tira contatos da supressão (o lojista assume o risco).
export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { contactIds } = body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'contactIds array is required' }, { status: 400 });
    }
    if (contactIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 contacts per request' }, { status: 400 });
    }

    // `suppressed` é a coluna real; o update anterior mexia em `status` e
    // era recusado inteiro — reativar nunca reativou ninguém.
    const { data: updated, error } = await supabaseAdmin
      .from('contacts')
      .update({
        suppressed: false,
        email_consent: true,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .in('id', contactIds)
      .eq('suppressed', true)
      .select('id, email, suppressed');

    if (error) {
      console.error('[Bounces] falha ao reativar:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reactivated: (updated || []).length,
      contacts: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
