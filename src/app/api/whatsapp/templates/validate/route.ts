// =============================================
// API: /api/whatsapp/templates/validate
// Validação de templates antes do envio
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getTemplateManager, buildTemplateComponents } from '@/lib/whatsapp/template-manager'

// POST - Validar template e variáveis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      organization_id,
      template_name,
      template_language = 'pt_BR',
      variables = {},
      recipient_count = 1,
      media_url,
      media_type,
    } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    if (!template_name) {
      return NextResponse.json({ error: 'template_name is required' }, { status: 400 })
    }

    // Usar Template Manager para validação completa
    const templateManager = getTemplateManager(organization_id)
    
    const validation = await templateManager.validateForCampaign(
      template_name,
      template_language,
      variables,
      recipient_count
    )

    // Se válido, gerar componentes formatados para API da Meta
    let metaComponents = null
    if (validation.valid && validation.template) {
      metaComponents = buildTemplateComponents(
        variables,
        media_url,
        media_type
      )
    }

    return NextResponse.json({
      valid: validation.valid,
      template: validation.template ? {
        id: validation.template.id,
        name: validation.template.name,
        language: validation.template.language,
        category: validation.template.category,
        status: validation.template.status,
        body_variables: validation.template.body_variables,
        header_type: validation.template.header_type,
      } : null,
      errors: validation.errors,
      warnings: validation.warnings,
      preview: validation.preview,
      meta_components: metaComponents,
    })

  } catch (error: any) {
    console.error('Template validation error:', error)
    return NextResponse.json({ 
      error: error.message || 'Validation failed' 
    }, { status: 500 })
  }
}

// GET - Extrair variáveis de um template
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const templateName = searchParams.get('template_name')
    const templateId = searchParams.get('template_id')
    const language = searchParams.get('language') || 'pt_BR'

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    if (!templateName && !templateId) {
      return NextResponse.json({ error: 'template_name or template_id is required' }, { status: 400 })
    }

    const templateManager = getTemplateManager(organizationId)
    
    let template
    if (templateId) {
      template = await templateManager.getTemplate(templateId)
    } else {
      template = await templateManager.getTemplateByName(templateName!, language)
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Extrair variáveis
    const variables = templateManager.extractVariables(template)

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        language: template.language,
        category: template.category,
        status: template.status,
        body_text: template.body_text,
        body_variables: template.body_variables,
        header_type: template.header_type,
        header_text: template.header_text,
        footer_text: template.footer_text,
        buttons: template.buttons,
      },
      variables,
      required_count: variables.length,
    })

  } catch (error: any) {
    console.error('Get template variables error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to get template' 
    }, { status: 500 })
  }
}
