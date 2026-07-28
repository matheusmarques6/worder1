// =============================================
// API: WhatsApp Cloud - Templates
// src/app/api/whatsapp/cloud/templates/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';
import { getAccessToken } from '@/lib/whatsapp/account-loader';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { checkRateLimit } from '@/lib/rate-limit';
export const dynamic = 'force-dynamic';

// B11: template CRUD e raro (10/min por org e folgado). Aceita 429 com Retry-After.
async function templateRateLimit(orgId: string) {
  const rl = await checkRateLimit(`wa:cloud:templates:${orgId}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'rate_limited', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  return null;
}

// =============================================
// GET - Listar templates
// =============================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return auth;
    const profile = { organization_id: auth.orgId };

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const syncFromMeta = searchParams.get('sync') === 'true';

    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    }

    // Buscar conta
    const { data: account } = await supabase
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Se solicitado sync, buscar da Meta API
    if (syncFromMeta) {
      try {
        const client = createWhatsAppCloudClient({
          phoneNumberId: account.phone_number_id,
          accessToken: getAccessToken(account),
          wabaId: account.waba_id,
        });

        const metaTemplates = await client.listTemplates(account.waba_id);

        for (const template of metaTemplates) {
          await supabase
            .from('whatsapp_templates')
            .upsert({
              organization_id: profile.organization_id,
              waba_id: account.id,
              template_id: template.id,
              meta_template_id: template.id,
              name: template.name,
              language: template.language,
              category: (template.category || '').toUpperCase(),
              status: (template.status || '').toUpperCase(),
              components: template.components,
              quality_score: (template as any).quality_score || null,
              rejection_reason: (template as any).rejected_reason || (template as any).rejection_reason || null,
              synced_at: new Date().toISOString(),
            }, {
              onConflict: 'waba_id,name,language',
            });
        }

        console.log(`[Templates] Synced ${metaTemplates.length} templates from Meta`);
      } catch (syncError) {
        console.error('[Templates] Sync error:', syncError);
        // Continuar para retornar templates do banco
      }
    }

    // Buscar templates do banco
    const { data: templates, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('waba_id', account.id)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Formatar templates para uso
    const formattedTemplates = (templates || []).map(t => ({
      id: t.id,
      templateId: t.template_id,
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      components: t.components,
      timesSent: t.times_sent,
      syncedAt: t.synced_at,
      // Extrair preview
      preview: extractTemplatePreview(t.components),
      // Extrair variáveis
      variables: extractTemplateVariables(t.components),
    }));

    return NextResponse.json({
      templates: formattedTemplates,
      total: formattedTemplates.length,
      approved: formattedTemplates.filter((t: any) => t.status === 'APPROVED').length,
      pending: formattedTemplates.filter((t: any) => t.status === 'PENDING').length,
      rejected: formattedTemplates.filter((t: any) => t.status === 'REJECTED').length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// POST - Criar template (submeter para aprovação)
// =============================================
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return auth;
    const profile = { organization_id: auth.orgId };

    const rateLimited = await templateRateLimit(profile.organization_id);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { 
      accountId,
      name,
      language = 'pt_BR',
      category,
      components,
    } = body;

    if (!accountId || !name || !category || !components) {
      return NextResponse.json({
        error: 'Missing required fields: accountId, name, category, components'
      }, { status: 400 });
    }

    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return NextResponse.json({
        error: 'Template name must start with a letter and contain only lowercase letters, numbers, and underscores'
      }, { status: 400 });
    }

    const validCategories = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
    const upperCategory = (category as string).toUpperCase();
    if (!validCategories.includes(upperCategory)) {
      return NextResponse.json({
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      }, { status: 400 });
    }

    const bodyComponent = (components as any[]).find((c: any) => c.type === 'BODY');
    if (!bodyComponent?.text) {
      return NextResponse.json({
        error: 'Template must include a BODY component with text'
      }, { status: 400 });
    }

    const varMatches = bodyComponent.text.match(/\{\{(\d+)\}\}/g) || [];
    const varNums = varMatches.map((v: string) => parseInt(v.replace(/[{}]/g, ''))).sort((a: number, b: number) => a - b);
    for (let i = 0; i < varNums.length; i++) {
      if (varNums[i] !== i + 1) {
        return NextResponse.json({
          error: `Variables must be contiguous starting from {{1}}. Found gap at {{${i + 1}}}`
        }, { status: 400 });
      }
    }

    // Meta requires example.body_text / example.header_text for every
    // variable. Reject early with a clear message instead of letting
    // Meta reject the template downstream.
    if (varMatches.length > 0) {
      const examples = bodyComponent.example?.body_text?.[0];
      if (!Array.isArray(examples) || examples.length !== varMatches.length ||
          examples.some((e: unknown) => typeof e !== 'string' || !e || (e as string).trim() === '')) {
        return NextResponse.json({
          error: `Body has ${varMatches.length} variable(s); provide a non-empty example for each (components[BODY].example.body_text)`
        }, { status: 400 });
      }
    }

    const headerComponent = (components as any[]).find((c: any) => c.type === 'HEADER');
    if (headerComponent?.format === 'TEXT' && headerComponent.text) {
      const headerVars = (headerComponent.text.match(/\{\{(\d+)\}\}/g) || []) as string[];
      if (headerVars.length > 0) {
        const headerExamples = headerComponent.example?.header_text;
        if (!Array.isArray(headerExamples) || headerExamples.length !== headerVars.length ||
            headerExamples.some((e: unknown) => typeof e !== 'string' || !e || (e as string).trim() === '')) {
          return NextResponse.json({
            error: `Header has ${headerVars.length} variable(s); provide a non-empty example for each (components[HEADER].example.header_text)`
          }, { status: 400 });
        }
      }
    }

    // Header de midia (IMAGE/VIDEO/DOCUMENT): a Meta exige um exemplo
    // enviado via Resumable Upload API (example.header_handle). Sem isso
    // ela rejeita a criacao tardiamente e sem feedback claro — barra aqui.
    const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT']
    const headerFormat = String(headerComponent?.format || '').toUpperCase()
    if (headerComponent && MEDIA_HEADER_FORMATS.includes(headerFormat)) {
      const handles = headerComponent.example?.header_handle
      if (!Array.isArray(handles) || handles.length === 0 ||
          typeof handles[0] !== 'string' || handles[0].trim() === '') {
        return NextResponse.json({
          error: `Header de midia (${headerFormat}) exige um exemplo enviado via Resumable Upload API da Meta: preencha components[HEADER].example.header_handle com o handle retornado pelo upload (formato "4::..."). Sem isso a Meta rejeita o template.`,
        }, { status: 400 });
      }
    }

    // Buscar conta
    const { data: account } = await supabase
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Criar na Meta API
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken: getAccessToken(account),
      wabaId: account.waba_id,
    });

    let result;
    try {
      result = await client.createTemplate(account.waba_id, {
        name,
        language,
        category: upperCategory as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
        components,
        allow_category_change: true,
      });
    } catch (apiError: any) {
      return NextResponse.json({
        error: apiError.message || 'Failed to create template',
        code: apiError.code,
        details: apiError.error_data
      }, { status: 400 });
    }

    const { data: template } = await supabase
      .from('whatsapp_templates')
      .insert({
        organization_id: profile.organization_id,
        waba_id: account.id,
        template_id: result.id,
        meta_template_id: result.id,
        name,
        language,
        category: upperCategory,
        status: 'PENDING',
        components,
        synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    return NextResponse.json({
      success: true,
      template,
      message: 'Template submitted for approval. It may take up to 24 hours.',
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// DELETE - Deletar template
// =============================================
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const rateLimited = await templateRateLimit(profile.organization_id);
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');
    const accountId = searchParams.get('accountId');

    if (!templateId || !accountId) {
      return NextResponse.json({ error: 'id and accountId required' }, { status: 400 });
    }

    // Buscar template e conta
    const { data: template } = await supabase
      .from('whatsapp_templates')
      .select('*, account:whatsapp_business_accounts(*)')
      .eq('id', templateId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Deletar na Meta API
    try {
      const client = createWhatsAppCloudClient({
        phoneNumberId: template.account.phone_number_id,
        accessToken: getAccessToken(template.account),
        wabaId: template.account.waba_id,
      });

      await client.deleteTemplate(template.account.waba_id, template.name);
    } catch (apiError: any) {
      console.error('Meta API delete error:', apiError);
      // Continuar para deletar do banco mesmo se falhar na Meta
    }

    // Deletar do banco
    await supabase
      .from('whatsapp_templates')
      .delete()
      .eq('id', templateId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// HELPERS
// =============================================

function extractTemplatePreview(components: any[]): string {
  const parts: string[] = [];

  for (const component of components || []) {
    if (component.type === 'HEADER' && component.text) {
      parts.push(`[Header] ${component.text}`);
    }
    if (component.type === 'BODY' && component.text) {
      parts.push(component.text);
    }
    if (component.type === 'FOOTER' && component.text) {
      parts.push(`[Footer] ${component.text}`);
    }
  }

  return parts.join('\n');
}

function extractTemplateVariables(components: any[]): Array<{ component: string; index: number; example?: string }> {
  const variables: Array<{ component: string; index: number; example?: string }> = [];

  for (const component of components || []) {
    const text = component.text || '';
    const matches = text.matchAll(/\{\{(\d+)\}\}/g);
    
    for (const match of matches) {
      const index = parseInt(match[1]);
      variables.push({
        component: component.type,
        index,
        example: component.example?.body_text?.[0]?.[index - 1],
      });
    }
  }

  return variables.sort((a, b) => a.index - b.index);
}
