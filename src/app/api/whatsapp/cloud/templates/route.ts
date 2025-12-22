// =============================================
// API: WhatsApp Cloud - Templates
// src/app/api/whatsapp/cloud/templates/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================
// GET - Listar templates
// =============================================
export async function GET(request: NextRequest) {
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
          accessToken: account.access_token,
          wabaId: account.waba_id,
        });

        const metaTemplates = await client.listTemplates(account.waba_id);

        // Upsert templates no banco
        for (const template of metaTemplates) {
          await supabase
            .from('whatsapp_templates')
            .upsert({
              organization_id: profile.organization_id,
              waba_id: account.id,
              template_id: template.id,
              name: template.name,
              language: template.language,
              category: template.category,
              status: template.status,
              components: template.components,
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
      approved: formattedTemplates.filter(t => t.status === 'APPROVED').length,
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

    const body = await request.json();
    const { 
      accountId,
      name,
      language = 'pt_BR',
      category,
      components,
    } = body;

    // Validar
    if (!accountId || !name || !category || !components) {
      return NextResponse.json({ 
        error: 'Missing required fields: accountId, name, category, components' 
      }, { status: 400 });
    }

    // Validar nome (apenas letras minúsculas e underscore)
    if (!/^[a-z_]+$/.test(name)) {
      return NextResponse.json({ 
        error: 'Template name must contain only lowercase letters and underscores' 
      }, { status: 400 });
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
      accessToken: account.access_token,
      wabaId: account.waba_id,
    });

    let result;
    try {
      result = await client.createTemplate(account.waba_id, {
        name,
        language,
        category,
        components,
      });
    } catch (apiError: any) {
      return NextResponse.json({ 
        error: apiError.message || 'Failed to create template',
        details: apiError.error_data
      }, { status: 400 });
    }

    // Salvar no banco
    const { data: template } = await supabase
      .from('whatsapp_templates')
      .insert({
        organization_id: profile.organization_id,
        waba_id: account.id,
        template_id: result.id,
        name,
        language,
        category,
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
        accessToken: template.account.access_token,
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
