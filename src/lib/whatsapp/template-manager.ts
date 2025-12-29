// =============================================
// TEMPLATE MANAGER - CACHE E VALIDAÇÃO
// Gerenciamento inteligente de templates WhatsApp
// =============================================

import { Redis } from '@upstash/redis'
import { createClient } from '@supabase/supabase-js'

// Inicializar Redis (lazy)
let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// =============================================
// TIPOS
// =============================================

export interface WhatsAppTemplate {
  id: string
  organization_id: string
  meta_template_id?: string
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status: 'approved' | 'pending' | 'rejected'
  rejection_reason?: string
  header_type?: 'none' | 'text' | 'image' | 'video' | 'document'
  header_text?: string
  header_media_url?: string
  body_text: string
  body_variables: number
  footer_text?: string
  buttons: TemplateButton[]
  use_count?: number
  last_used_at?: string
  created_at: string
  updated_at: string
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
  text: string
  url?: string
  phone_number?: string
}

export interface TemplateValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  preview?: {
    header?: string
    body: string
    footer?: string
  }
}

export interface TemplateVariable {
  index: number
  placeholder: string
  value?: string
  type: 'text' | 'currency' | 'date_time'
}

// =============================================
// CONFIGURAÇÃO
// =============================================

const CACHE_CONFIG = {
  TTL_TEMPLATES_LIST: 300,      // 5 minutos
  TTL_SINGLE_TEMPLATE: 600,     // 10 minutos
  TTL_APPROVED_ONLY: 300,       // 5 minutos
  PREFIX: 'wa:templates',
}

// =============================================
// TEMPLATE MANAGER CLASS
// =============================================

export class TemplateManager {
  private organizationId: string

  constructor(organizationId: string) {
    this.organizationId = organizationId
  }

  // =============================================
  // BUSCAR TEMPLATES (COM CACHE)
  // =============================================

  /**
   * Buscar todos os templates da organização
   * Usa cache Redis com TTL de 5 minutos
   */
  async getTemplates(options: {
    category?: string
    status?: string
    forceRefresh?: boolean
  } = {}): Promise<WhatsAppTemplate[]> {
    const { category, status = 'approved', forceRefresh = false } = options
    const cacheKey = `${CACHE_CONFIG.PREFIX}:${this.organizationId}:${status}:${category || 'all'}`

    // Tentar cache primeiro (se não forçar refresh)
    if (!forceRefresh) {
      try {
        const cached = await getRedis().get<WhatsAppTemplate[]>(cacheKey)
        if (cached) {
          console.log('📦 Templates from cache')
          return cached
        }
      } catch (e) {
        console.warn('Cache read error:', e)
      }
    }

    // Buscar do banco
    console.log('🔄 Fetching templates from database')
    let query = supabase
      .from('whatsapp_templates')
      .select('*')
      .or(`organization_id.eq.${this.organizationId},organization_id.eq.00000000-0000-0000-0000-000000000000`)
      .order('use_count', { ascending: false })

    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch templates: ${error.message}`)
    }

    const templates = (data || []) as WhatsAppTemplate[]

    // Salvar no cache
    try {
      await getRedis().setex(cacheKey, CACHE_CONFIG.TTL_TEMPLATES_LIST, templates)
    } catch (e) {
      console.warn('Cache write error:', e)
    }

    return templates
  }

  /**
   * Buscar template por ID
   */
  async getTemplate(templateId: string): Promise<WhatsAppTemplate | null> {
    const cacheKey = `${CACHE_CONFIG.PREFIX}:single:${templateId}`

    // Tentar cache
    try {
      const cached = await getRedis().get<WhatsAppTemplate>(cacheKey)
      if (cached) return cached
    } catch (e) {
      console.warn('Cache read error:', e)
    }

    // Buscar do banco
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (error || !data) return null

    const template = data as WhatsAppTemplate

    // Salvar no cache
    try {
      await getRedis().setex(cacheKey, CACHE_CONFIG.TTL_SINGLE_TEMPLATE, template)
    } catch (e) {
      console.warn('Cache write error:', e)
    }

    return template
  }

  /**
   * Buscar template por nome
   */
  async getTemplateByName(name: string, language: string = 'pt_BR'): Promise<WhatsAppTemplate | null> {
    const cacheKey = `${CACHE_CONFIG.PREFIX}:name:${this.organizationId}:${name}:${language}`

    try {
      const cached = await getRedis().get<WhatsAppTemplate>(cacheKey)
      if (cached) return cached
    } catch (e) {
      console.warn('Cache read error:', e)
    }

    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('name', name)
      .eq('language', language)
      .single()

    if (error || !data) return null

    const template = data as WhatsAppTemplate

    try {
      await getRedis().setex(cacheKey, CACHE_CONFIG.TTL_SINGLE_TEMPLATE, template)
    } catch (e) {
      console.warn('Cache write error:', e)
    }

    return template
  }

  // =============================================
  // VALIDAÇÃO DE VARIÁVEIS
  // =============================================

  /**
   * Extrair variáveis de um template
   * Retorna array com {{1}}, {{2}}, etc
   */
  extractVariables(template: WhatsAppTemplate): TemplateVariable[] {
    const variables: TemplateVariable[] = []
    const regex = /\{\{(\d+)\}\}/g
    let match

    // Extrair do body
    while ((match = regex.exec(template.body_text)) !== null) {
      const index = parseInt(match[1])
      if (!variables.find(v => v.index === index)) {
        variables.push({
          index,
          placeholder: match[0],
          type: 'text',
        })
      }
    }

    // Extrair do header (se for texto)
    if (template.header_type === 'text' && template.header_text) {
      regex.lastIndex = 0
      while ((match = regex.exec(template.header_text)) !== null) {
        const index = parseInt(match[1])
        if (!variables.find(v => v.index === index)) {
          variables.push({
            index,
            placeholder: match[0],
            type: 'text',
          })
        }
      }
    }

    // Ordenar por índice
    return variables.sort((a, b) => a.index - b.index)
  }

  /**
   * Validar variáveis antes do envio
   * Retorna erros e warnings
   */
  validateVariables(
    template: WhatsAppTemplate,
    variables: Record<string, string>
  ): TemplateValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const requiredVars = this.extractVariables(template)

    // Verificar variáveis obrigatórias
    for (const varDef of requiredVars) {
      const key = varDef.index.toString()
      const value = variables[key]

      if (!value || value.trim() === '') {
        errors.push(`Variável {{${varDef.index}}} é obrigatória`)
      } else {
        // Validar tamanho
        if (value.length > 1024) {
          errors.push(`Variável {{${varDef.index}}} excede 1024 caracteres`)
        }

        // Warning para variáveis muito curtas
        if (value.length < 2) {
          warnings.push(`Variável {{${varDef.index}}} parece muito curta: "${value}"`)
        }

        // Warning para caracteres especiais suspeitos
        if (/[<>{}]/.test(value)) {
          warnings.push(`Variável {{${varDef.index}}} contém caracteres especiais`)
        }
      }
    }

    // Verificar se status é approved
    if (template.status !== 'approved') {
      errors.push(`Template não está aprovado (status: ${template.status})`)
    }

    // Gerar preview se válido
    let preview: TemplateValidationResult['preview'] | undefined

    if (errors.length === 0) {
      preview = this.renderPreview(template, variables)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      preview,
    }
  }

  /**
   * Renderizar preview do template com variáveis
   */
  renderPreview(
    template: WhatsAppTemplate,
    variables: Record<string, string>
  ): { header?: string; body: string; footer?: string } {
    const replaceVars = (text: string): string => {
      return text.replace(/\{\{(\d+)\}\}/g, (match, index) => {
        return variables[index] || match
      })
    }

    return {
      header: template.header_type === 'text' && template.header_text
        ? replaceVars(template.header_text)
        : undefined,
      body: replaceVars(template.body_text),
      footer: template.footer_text || undefined,
    }
  }

  // =============================================
  // VALIDAÇÃO COMPLETA PARA CAMPANHA
  // =============================================

  /**
   * Validar template para uso em campanha
   * Verifica: aprovação, variáveis, limites
   */
  async validateForCampaign(
    templateName: string,
    language: string,
    variables: Record<string, string>,
    recipientCount: number
  ): Promise<{
    valid: boolean
    template: WhatsAppTemplate | null
    errors: string[]
    warnings: string[]
    preview?: { header?: string; body: string; footer?: string }
  }> {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Buscar template
    const template = await this.getTemplateByName(templateName, language)

    if (!template) {
      return {
        valid: false,
        template: null,
        errors: [`Template "${templateName}" não encontrado para idioma "${language}"`],
        warnings: [],
      }
    }

    // 2. Verificar status
    if (template.status === 'rejected') {
      errors.push(`Template foi rejeitado: ${template.rejection_reason || 'Motivo não informado'}`)
    } else if (template.status === 'pending') {
      errors.push('Template ainda está pendente de aprovação da Meta')
    }

    // 3. Validar variáveis
    const varValidation = this.validateVariables(template, variables)
    errors.push(...varValidation.errors)
    warnings.push(...varValidation.warnings)

    // 4. Verificar categoria vs quantidade
    if (template.category === 'MARKETING' && recipientCount > 1000) {
      warnings.push('Campanhas de marketing com mais de 1000 destinatários podem ter taxa de entrega reduzida')
    }

    // 5. Verificar se tem header de mídia sem URL
    if (['image', 'video', 'document'].includes(template.header_type || '') && !template.header_media_url) {
      warnings.push('Template tem header de mídia mas nenhuma mídia padrão configurada')
    }

    return {
      valid: errors.length === 0,
      template,
      errors,
      warnings,
      preview: varValidation.preview,
    }
  }

  // =============================================
  // CACHE MANAGEMENT
  // =============================================

  /**
   * Invalidar cache de templates
   */
  async invalidateCache(): Promise<void> {
    const redis = getRedis()
    const pattern = `${CACHE_CONFIG.PREFIX}:${this.organizationId}:*`

    try {
      // Buscar todas as keys que batem com o padrão
      const keys = await redis.keys(pattern)
      if (keys.length > 0) {
        await Promise.all(keys.map(key => redis.del(key)))
        console.log(`🗑️ Invalidated ${keys.length} template cache keys`)
      }
    } catch (e) {
      console.warn('Cache invalidation error:', e)
    }
  }

  /**
   * Registrar uso de template
   */
  async recordUsage(templateId: string): Promise<void> {
    try {
      await supabase.rpc('increment_template_usage', {
        p_template_id: templateId
      })

      // Invalidar cache do template específico
      await getRedis().del(`${CACHE_CONFIG.PREFIX}:single:${templateId}`)
    } catch (e) {
      console.warn('Failed to record template usage:', e)
    }
  }
}

// =============================================
// FACTORY FUNCTION
// =============================================

const managers = new Map<string, TemplateManager>()

export function getTemplateManager(organizationId: string): TemplateManager {
  let manager = managers.get(organizationId)

  if (!manager) {
    manager = new TemplateManager(organizationId)
    managers.set(organizationId, manager)
  }

  return manager
}

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Formatar componentes de template para API da Meta
 */
export function buildTemplateComponents(
  variables: Record<string, string>,
  headerMediaUrl?: string,
  headerMediaType?: 'image' | 'video' | 'document'
): any[] {
  const components: any[] = []

  // Body variables (sempre em ordem numérica)
  const bodyParams = Object.entries(variables)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([_, value]) => ({
      type: 'text',
      text: String(value).substring(0, 1024), // Limite da Meta
    }))

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams,
    })
  }

  // Header com mídia
  if (headerMediaUrl && headerMediaType) {
    components.push({
      type: 'header',
      parameters: [{
        type: headerMediaType,
        [headerMediaType]: { link: headerMediaUrl },
      }],
    })
  }

  return components
}

/**
 * Validar variáveis básicas (sem buscar template)
 */
export function quickValidateVariables(
  variables: Record<string, string>,
  requiredCount: number
): { valid: boolean; missing: number[] } {
  const missing: number[] = []

  for (let i = 1; i <= requiredCount; i++) {
    const value = variables[i.toString()]
    if (!value || value.trim() === '') {
      missing.push(i)
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  }
}

// =============================================
// EXPORTS
// =============================================
export default TemplateManager
