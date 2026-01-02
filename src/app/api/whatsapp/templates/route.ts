import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getTemplates } from '@/lib/whatsapp/meta-api'

// GET /api/whatsapp/templates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const category = searchParams.get('category')
    const status = searchParams.get('status') || 'approved'
    const search = searchParams.get('search')

    let query = supabase
      .from('whatsapp_templates')
      .select('*')
      .order('use_count', { ascending: false })

    // Filtrar por organização ou templates globais
    if (organizationId) {
      query = query.or(`organization_id.eq.${organizationId},organization_id.eq.00000000-0000-0000-0000-000000000000`)
    }

    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)
    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error } = await query
    if (error) throw error

    const grouped = {
      MARKETING: (data || []).filter(t => t.category === 'MARKETING'),
      UTILITY: (data || []).filter(t => t.category === 'UTILITY'),
      AUTHENTICATION: (data || []).filter(t => t.category === 'AUTHENTICATION'),
    }

    return NextResponse.json({ templates: data || [], grouped, total: data?.length || 0 })
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST /api/whatsapp/templates - Criar template OU sincronizar da Meta
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Se action = 'sync', sincronizar da Meta
    if (body.action === 'sync') {
      return await syncTemplatesFromMeta(body.organizationId)
    }

    // Criar template manual
    const { organizationId, name, category = 'MARKETING', language = 'pt_BR',
      header_type, header_text, header_media_url, body_text, footer_text, buttons = [] } = body

    if (!name || !body_text) {
      return NextResponse.json({ error: 'Name and body_text are required' }, { status: 400 })
    }

    const variableMatches = body_text.match(/\{\{\d+\}\}/g) || []
    const body_variables = variableMatches.length

    const { data: template, error } = await supabase
      .from('whatsapp_templates')
      .insert({
        organization_id: organizationId || '00000000-0000-0000-0000-000000000000',
        name, category, language, status: 'pending',
        header_type, header_text, header_media_url, body_text, body_variables, footer_text, buttons
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Error creating template:', error)
    return NextResponse.json({ error: error.message || 'Failed to create template' }, { status: 500 })
  }
}

// Sincronizar templates da Meta API
async function syncTemplatesFromMeta(organizationId?: string) {
  try {
    // Buscar instância WhatsApp com credenciais
    let instanceQuery = supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('status', 'connected')
      .single()

    if (organizationId) {
      instanceQuery = supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'connected')
        .single()
    }

    const { data: instance } = await instanceQuery

    if (!instance || !instance.access_token || !instance.waba_id) {
      return NextResponse.json({ 
        error: 'No configured WhatsApp instance found. Please connect your WhatsApp Business Account first.',
        details: 'Missing access_token or waba_id'
      }, { status: 400 })
    }

    // Buscar templates da Meta
    const metaTemplates = await getTemplates({
      wabaId: instance.waba_id,
      accessToken: instance.access_token
    })

    let synced = 0
    let updated = 0

    for (const template of metaTemplates) {
      // Processar componentes
      let headerType = 'none'
      let headerText = null
      let headerMediaUrl = null
      let bodyText = ''
      let bodyVariables = 0
      let footerText = null
      let buttons: any[] = []

      for (const component of template.components || []) {
        if (component.type === 'HEADER') {
          headerType = (component.format || 'TEXT').toLowerCase()
          headerText = component.text || null
          if (component.example?.header_handle) {
            headerMediaUrl = component.example.header_handle[0]
          }
        } else if (component.type === 'BODY') {
          bodyText = component.text || ''
          const matches = bodyText.match(/\{\{\d+\}\}/g)
          bodyVariables = matches ? matches.length : 0
        } else if (component.type === 'FOOTER') {
          footerText = component.text || null
        } else if (component.type === 'BUTTONS') {
          buttons = component.buttons || []
        }
      }

      const templateData = {
        organization_id: instance.organization_id,
        instance_id: instance.id,
        meta_template_id: template.id,
        name: template.name,
        language: template.language,
        category: template.category,
        status: template.status?.toLowerCase() || 'pending',
        rejection_reason: template.rejected_reason || null,
        header_type: headerType,
        header_text: headerText,
        header_media_url: headerMediaUrl,
        body_text: bodyText,
        body_variables: bodyVariables,
        footer_text: footerText,
        buttons: buttons,
        updated_at: new Date().toISOString()
      }

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('whatsapp_templates')
        .select('id')
        .eq('organization_id', instance.organization_id)
        .eq('name', template.name)
        .eq('language', template.language)
        .single()

      if (existing) {
        // Atualizar
        await supabase
          .from('whatsapp_templates')
          .update(templateData)
          .eq('id', existing.id)
        updated++
      } else {
        // Criar
        await supabase
          .from('whatsapp_templates')
          .insert({
            ...templateData,
            created_at: new Date().toISOString()
          })
        synced++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída: ${synced} novos, ${updated} atualizados`,
      synced,
      updated,
      total: metaTemplates.length
    })

  } catch (error: any) {
    console.error('Error syncing templates:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to sync templates from Meta' 
    }, { status: 500 })
  }
}
