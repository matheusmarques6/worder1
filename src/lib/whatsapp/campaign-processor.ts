// =============================================
// CAMPAIGN PROCESSOR - ALTA ESCALA
// Processa campanhas usando queue + rate limiting
// =============================================

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { MessageQueue, campaignQueue, QueueJob } from './queue'
import { WhatsAppRateLimiter, getRateLimiter } from './rate-limiter'
import { CircuitBreaker, getCircuitBreaker } from './circuit-breaker'
import { withRetry, createWhatsAppRetry, sleep } from './backoff'
import { sendTemplateMessage } from './meta-api'
import { requireOptIn } from './opt-out-guard'
import { sendAlert } from './alerts'
import { wlog } from '@/lib/observability/whatsapp-logger'

// =============================================
// SUPABASE CLIENT
// =============================================

// =============================================
// CONFIGURAÇÕES
// =============================================

export const CAMPAIGN_CONFIG = {
  // Batching
  batchSize: 100,              // Recipients por batch
  maxParallelBatches: 5,       // Batches em paralelo
  batchStaggerMs: 2000,        // Delay entre batches na fila

  // Rate limiting
  targetMPS: 70,               // Target msg/segundo
  minDelayBetweenMs: 15,       // 1000/70 ≈ 14ms

  // Retry
  maxRetries: 5,
  baseBackoffMs: 1000,
  maxBackoffMs: 30000,

  // Worker
  pollIntervalMs: 1000,        // Intervalo de poll da fila
  jobTimeoutMs: 300000,        // 5 min timeout por job

  // Stuck jobs
  stuckJobTimeoutMs: 600000,   // 10 min
  recoverStuckIntervalMs: 60000, // Check a cada 1 min
}

// =============================================
// TYPES
// =============================================

export interface CampaignBatchData {
  campaignId: string
  batchIndex: number
  recipients: Array<{
    id: string
    phone_number: string
    contact_name: string | null
    resolved_variables: Record<string, string>
    retry_count?: number
  }>
  instance: {
    id: string
    phoneNumberId: string
    accessToken: string
    tier: number
  }
  template: {
    name: string
    language: string
    category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  }
  organizationId: string
  mediaUrl?: string
  mediaType?: string
}

export interface ProcessResult {
  sent: number
  failed: number
  skipped: number
  errors: Array<{ phone: string; error: string }>
}

// =============================================
// CAMPAIGN PROCESSOR CLASS
// =============================================

export class CampaignProcessor {
  private isRunning = false
  private rateLimiters: Map<string, WhatsAppRateLimiter> = new Map()
  private circuitBreakers: Map<string, CircuitBreaker> = new Map()
  private whatsAppRetry = createWhatsAppRetry({
    maxRetries: CAMPAIGN_CONFIG.maxRetries,
    baseDelay: CAMPAIGN_CONFIG.baseBackoffMs,
    maxDelay: CAMPAIGN_CONFIG.maxBackoffMs,
  })

  // =============================================
  // INICIAR CAMPANHA
  // =============================================

  /**
   * Iniciar campanha - prepara recipients e enfileira batches
   */
  async startCampaign(campaignId: string): Promise<{
    success: boolean
    totalRecipients: number
    totalBatches: number
    error?: string
  }> {
    console.log(`🚀 Starting campaign ${campaignId}`)

    try {
      // 1. Buscar campanha
      const { data: campaign, error: campaignError } = await supabase
        .from('whatsapp_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()

      if (campaignError || !campaign) {
        throw new Error('Campaign not found')
      }

      if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
        throw new Error(`Campaign cannot be started (status: ${campaign.status})`)
      }

      // 2. Buscar instância WhatsApp
      const { data: instance, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', campaign.organization_id)
        .eq('status', 'connected')
        .single()

      if (instanceError || !instance?.access_token || !instance?.phone_number_id) {
        throw new Error('No configured WhatsApp instance found')
      }

      // 3. Buscar recipients pendentes
      let recipients = await this.getRecipients(campaign)

      if (recipients.length === 0) {
        // Se não tem recipients, criar a partir da audiência
        recipients = await this.createRecipients(campaign)
      }

      if (recipients.length === 0) {
        throw new Error('No recipients found for this campaign')
      }

      // 4. Atualizar status para running
      await supabase
        .from('whatsapp_campaigns')
        .update({
          status: 'running',
          started_at: new Date().toISOString(),
          instance_id: instance.id,
          total_recipients: recipients.length,
        })
        .eq('id', campaignId)

      // 5. Dividir em batches
      const batches: typeof recipients[] = []
      for (let i = 0; i < recipients.length; i += CAMPAIGN_CONFIG.batchSize) {
        batches.push(recipients.slice(i, i + CAMPAIGN_CONFIG.batchSize))
      }

      // 6. Enfileirar batches
      for (let i = 0; i < batches.length; i++) {
        const batchData: CampaignBatchData = {
          campaignId,
          batchIndex: i,
          recipients: batches[i],
          instance: {
            id: instance.id,
            phoneNumberId: instance.phone_number_id,
            accessToken: instance.access_token,
            tier: instance.messaging_tier || 1,
          },
          template: {
            name: campaign.template_name || campaign.template?.name,
            language: campaign.template?.language || 'pt_BR',
            category: (() => {
              const c = (campaign.template?.category as string | undefined)?.toUpperCase()
              return c === 'MARKETING' || c === 'UTILITY' || c === 'AUTHENTICATION' ? c : undefined
            })(),
          },
          organizationId: campaign.organization_id,
          mediaUrl: campaign.media_url,
          mediaType: campaign.media_type,
        }

        await campaignQueue.add('send_campaign_batch', batchData, {
          delay: i * CAMPAIGN_CONFIG.batchStaggerMs,
          priority: i, // Processar em ordem
        })
      }

      // 7. Log
      await this.log(campaignId, 'info', `Campaign started with ${recipients.length} recipients in ${batches.length} batches`)

      console.log(`✅ Campaign ${campaignId} queued: ${recipients.length} recipients, ${batches.length} batches`)

      return {
        success: true,
        totalRecipients: recipients.length,
        totalBatches: batches.length,
      }
    } catch (error: any) {
      console.error(`❌ Error starting campaign ${campaignId}:`, error)

      await supabase
        .from('whatsapp_campaigns')
        .update({ status: 'failed' })
        .eq('id', campaignId)

      await this.log(campaignId, 'error', `Failed to start: ${error.message}`)

      return {
        success: false,
        totalRecipients: 0,
        totalBatches: 0,
        error: error.message,
      }
    }
  }

  /**
   * Pausar campanha
   */
  async pauseCampaign(campaignId: string): Promise<boolean> {
    await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
      })
      .eq('id', campaignId)

    await this.log(campaignId, 'info', 'Campaign paused')
    console.log(`⏸️ Campaign ${campaignId} paused`)
    return true
  }

  /**
   * Retomar campanha pausada
   */
  async resumeCampaign(campaignId: string): Promise<boolean> {
    const result = await this.startCampaign(campaignId)
    return result.success
  }

  /**
   * Cancelar campanha
   */
  async cancelCampaign(campaignId: string): Promise<boolean> {
    await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaignId)

    // Marcar recipients pendentes como skipped
    await supabase
      .from('whatsapp_campaign_recipients')
      .update({ status: 'skipped' })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')

    await this.log(campaignId, 'info', 'Campaign cancelled')
    console.log(`🚫 Campaign ${campaignId} cancelled`)
    return true
  }

  // =============================================
  // WORKER
  // =============================================

  /**
   * Iniciar worker para processar fila
   */
  async startWorker(): Promise<void> {
    if (this.isRunning) {
      console.log('Worker already running')
      return
    }

    this.isRunning = true
    console.log('🚀 Campaign worker started')

    // Recuperar jobs stuck periodicamente
    const recoverInterval = setInterval(async () => {
      if (this.isRunning) {
        await campaignQueue.recoverStuckJobs(CAMPAIGN_CONFIG.stuckJobTimeoutMs)
      }
    }, CAMPAIGN_CONFIG.recoverStuckIntervalMs)

    // Loop principal
    while (this.isRunning) {
      try {
        const job = await campaignQueue.getNext()

        if (!job) {
          await sleep(CAMPAIGN_CONFIG.pollIntervalMs)
          continue
        }

        await this.processJob(job)
      } catch (error: any) {
        console.error('Worker error:', error)
        await sleep(CAMPAIGN_CONFIG.pollIntervalMs)
      }
    }

    clearInterval(recoverInterval)
    console.log('⏹️ Campaign worker stopped')
  }

  /**
   * Parar worker
   */
  stopWorker(): void {
    this.isRunning = false
  }

  /**
   * Processar um job
   */
  private async processJob(job: QueueJob<CampaignBatchData>): Promise<void> {
    const startTime = Date.now()
    console.log(`📦 Processing job ${job.id} (batch ${job.data.batchIndex}, attempt ${job.attempts})`)

    try {
      // Verificar se campanha ainda está running
      const { data: campaign } = await supabase
        .from('whatsapp_campaigns')
        .select('status')
        .eq('id', job.data.campaignId)
        .single()

      if (!campaign || !['running'].includes(campaign.status)) {
        console.log(`⏭️ Campaign ${job.data.campaignId} is ${campaign?.status}, skipping batch`)
        await campaignQueue.complete(job.id, { skipped: true, reason: 'Campaign not running' })
        return
      }

      // D6: aborta o batch se a WABA esta com qualidade RED (risco de ban).
      // Tambem auto-pausa a campanha pra parar batches seguintes; alerta
      // humano via Slack. quality_rating stale + TIER_DISABLED = guardrail.
      const { data: waba } = await supabase
        .from('whatsapp_business_accounts')
        .select('id, quality_rating, messaging_limit, verified_name, organization_id')
        .eq('organization_id', job.data.organizationId)
        .eq('phone_number_id', job.data.instance.phoneNumberId)
        .maybeSingle()

      if (waba?.quality_rating === 'RED' && waba?.messaging_limit !== 'TIER_DISABLED') {
        wlog.warn('whatsapp.campaign.paused_red_quality', {
          campaign_id: job.data.campaignId,
          organization_id: job.data.organizationId,
          waba_id: waba.id,
          phone_number_id: job.data.instance.phoneNumberId,
        })

        await supabase
          .from('whatsapp_campaigns')
          .update({ status: 'paused', paused_at: new Date().toISOString() })
          .eq('id', job.data.campaignId)

        await sendAlert({
          severity: 'critical',
          type: 'quality_drop',
          title: 'Campanha auto-pausada (RED quality)',
          message: `Campanha ${job.data.campaignId} pausada — a WABA ${waba.verified_name || job.data.instance.phoneNumberId} esta com qualidade RED. Continuar enviar arrisca ban.`,
          organizationId: job.data.organizationId,
          wabaId: waba.id,
          metadata: {
            campaign_id: job.data.campaignId,
            phone_number_id: job.data.instance.phoneNumberId,
            messaging_limit: waba.messaging_limit,
          },
        })

        await campaignQueue.complete(job.id, { skipped: true, reason: 'red_quality' })
        return
      }

      // Processar batch
      const result = await this.processBatch(job.data)

      // Completar job
      await campaignQueue.complete(job.id, result)

      const duration = Date.now() - startTime
      console.log(`✅ Job ${job.id} completed in ${duration}ms: ${result.sent} sent, ${result.failed} failed`)

      // Verificar se campanha completou
      await this.checkCampaignCompletion(job.data.campaignId)

    } catch (error: any) {
      console.error(`❌ Job ${job.id} failed:`, error.message)

      const retried = await campaignQueue.fail(job.id, error.message)

      if (!retried) {
        // Job foi para DLQ, logar
        await this.log(
          job.data.campaignId,
          'error',
          `Batch ${job.data.batchIndex} failed permanently: ${error.message}`
        )
      }
    }
  }

  /**
   * Processar batch de mensagens
   */
  private async processBatch(data: CampaignBatchData): Promise<ProcessResult> {
    const { campaignId, recipients, instance, template, mediaUrl, mediaType, organizationId } = data

    // Obter rate limiter e circuit breaker
    const rateLimiter = this.getRateLimiter(instance.id, instance.tier)
    const circuitBreaker = this.getCircuitBreaker(instance.id)

    const result: ProcessResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }

    for (const recipient of recipients) {
      try {
        // Onda 10 — guard opt-out DENTRO do loop (race STOP-vs-campanha).
        // STOP processado em paralelo pula recipients opted_out em tempo real.
        const optCheck = await requireOptIn(
          organizationId,
          recipient.phone_number,
          template.category,
          { sender: 'campaign-processor' },
        )
        if (!optCheck.allowed) {
          await supabase
            .from('whatsapp_campaign_recipients')
            .update({
              status: 'skipped',
              error_message: 'Contato opted_out',
            })
            .eq('id', recipient.id)
          result.skipped++
          continue
        }

        // Verificar circuit breaker
        if (!await circuitBreaker.canExecute()) {
          console.log(`🔴 Circuit breaker OPEN for instance ${instance.id}`)
          // Requeue os recipients restantes
          result.skipped += recipients.length - (result.sent + result.failed)
          throw new Error('Circuit breaker OPEN')
        }

        // Verificar rate limit
        const rateCheck = await rateLimiter.canSend(recipient.phone_number)
        if (!rateCheck.allowed) {
          console.log(`⏳ Rate limited, waiting ${rateCheck.retryAfter}s`)
          await sleep((rateCheck.retryAfter || 1) * 1000)

          // Re-check
          const recheck = await rateLimiter.canSend(recipient.phone_number)
          if (!recheck.allowed) {
            result.skipped++
            continue
          }
        }

        // Preparar componentes do template
        const components = this.buildTemplateComponents(
          recipient.resolved_variables,
          mediaUrl,
          mediaType
        )

        // Enviar com retry
        const sendResult = await this.whatsAppRetry(() =>
          sendTemplateMessage({
            phoneNumberId: instance.phoneNumberId,
            accessToken: instance.accessToken,
            to: recipient.phone_number,
            templateName: template.name,
            languageCode: template.language,
            components,
          })
        )

        // Sucesso!
        await supabase
          .from('whatsapp_campaign_recipients')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            meta_message_id: sendResult.messages?.[0]?.id,
          })
          .eq('id', recipient.id)

        await circuitBreaker.recordSuccess()
        result.sent++

        // Delay entre mensagens
        await sleep(rateLimiter.getRecommendedDelay())

      } catch (error: any) {
        console.error(`Failed to send to ${recipient.phone_number}:`, error.message)

        await rateLimiter.recordError(error.code || 'UNKNOWN')
        await circuitBreaker.recordFailure(error)

        await supabase
          .from('whatsapp_campaign_recipients')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            error_code: error.code?.toString() || 'UNKNOWN',
            error_message: error.message,
            retry_count: (recipient.retry_count || 0) + 1,
          })
          .eq('id', recipient.id)

        result.failed++
        result.errors.push({ phone: recipient.phone_number, error: error.message })
      }
    }

    // Atualizar contadores da campanha
    await supabase.rpc('increment_campaign_sent', {
      p_campaign_id: campaignId,
      p_sent: result.sent,
      p_failed: result.failed,
    })

    return result
  }

  // =============================================
  // HELPERS
  // =============================================

  private getRateLimiter(instanceId: string, tier: number): WhatsAppRateLimiter {
    const key = `${instanceId}:${tier}`
    let limiter = this.rateLimiters.get(key)
    if (!limiter) {
      limiter = getRateLimiter(instanceId, tier)
      this.rateLimiters.set(key, limiter)
    }
    return limiter
  }

  private getCircuitBreaker(instanceId: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(instanceId)
    if (!cb) {
      cb = getCircuitBreaker(`wa:${instanceId}`, {
        failureThreshold: 5,
        resetTimeout: 30000,
      })
      this.circuitBreakers.set(instanceId, cb)
    }
    return cb
  }

  private buildTemplateComponents(
    variables: Record<string, string>,
    mediaUrl?: string,
    mediaType?: string
  ): any[] {
    const components: any[] = []

    // Body variables
    if (variables && Object.keys(variables).length > 0) {
      const bodyParams = Object.entries(variables)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([_, value]) => ({ type: 'text', text: String(value) }))

      if (bodyParams.length > 0) {
        components.push({
          type: 'body',
          parameters: bodyParams,
        })
      }
    }

    // Header com mídia
    if (mediaUrl && mediaType) {
      components.push({
        type: 'header',
        parameters: [{
          type: mediaType,
          [mediaType]: { link: mediaUrl },
        }],
      })
    }

    return components
  }

  private async getRecipients(campaign: any): Promise<any[]> {
    const { data: recipients } = await supabase
      .from('whatsapp_campaign_recipients')
      .select('id, phone_number, contact_name, resolved_variables, retry_count')
      .eq('campaign_id', campaign.id)
      .in('status', ['pending', 'queued'])

    return recipients || []
  }

  private async createRecipients(campaign: any): Promise<any[]> {
    let contacts: any[] = []

    // Buscar contatos baseado no tipo de audiência
    if (campaign.audience_type === 'phonebook' && campaign.audience_phonebook_id) {
      const { data } = await supabase
        .from('phonebook_contacts')
        .select('id, name, mobile, email')
        .eq('phonebook_id', campaign.audience_phonebook_id)

      contacts = (data || []).map(c => ({
        id: c.id,
        phone_number: c.mobile,
        name: c.name,
        email: c.email,
      }))
    } else if (campaign.audience_type === 'import' && campaign.imported_contacts) {
      contacts = campaign.imported_contacts.map((c: any, i: number) => ({
        id: `imported-${i}`,
        phone_number: c.phone || c.mobile || c.telefone,
        name: c.name || c.nome,
        email: c.email,
      }))
    } else {
      let query = supabase
        .from('whatsapp_contacts')
        .select('id, phone_number, name, email')
        .eq('organization_id', campaign.organization_id)
        .or('is_blocked.is.null,is_blocked.eq.false')

      if (campaign.audience_type === 'tags' && campaign.audience_tags?.length > 0) {
        query = query.overlaps('tags', campaign.audience_tags)
      }

      const { data } = await query
      contacts = data || []
    }

    // Criar recipients
    const recipients = contacts.map(contact => ({
      campaign_id: campaign.id,
      contact_id: contact.id,
      phone_number: contact.phone_number,
      contact_name: contact.name,
      status: 'pending',
      resolved_variables: this.resolveVariables(campaign.template_variables, contact),
      queued_at: new Date().toISOString(),
    }))

    // Inserir em batches
    const insertBatchSize = 500
    for (let i = 0; i < recipients.length; i += insertBatchSize) {
      await supabase
        .from('whatsapp_campaign_recipients')
        .insert(recipients.slice(i, i + insertBatchSize))
    }

    // Retornar para processamento
    return recipients.map((r, i) => ({
      ...r,
      id: `new-${i}`, // ID temporário, será buscado depois
    }))
  }

  private resolveVariables(
    templateVars: Record<string, any>,
    contact: any
  ): Record<string, string> {
    const resolved: Record<string, string> = {}

    Object.entries(templateVars || {}).forEach(([key, config]: [string, any]) => {
      if (config?.type === 'static') {
        resolved[key] = config.value || ''
      } else if (config?.type === 'field') {
        switch (config.value) {
          case 'name':
            resolved[key] = contact.name || 'Cliente'
            break
          case 'phone':
            resolved[key] = contact.phone_number || ''
            break
          case 'email':
            resolved[key] = contact.email || ''
            break
          default:
            resolved[key] = config.value || ''
        }
      } else if (typeof config === 'string') {
        resolved[key] = config
      }
    })

    return resolved
  }

  private async checkCampaignCompletion(campaignId: string): Promise<void> {
    // Verificar se ainda tem jobs na fila
    const queueStats = await campaignQueue.getStats()
    
    // Verificar recipients pendentes
    const { count: pendingCount } = await supabase
      .from('whatsapp_campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'queued'])

    if (pendingCount === 0) {
      // Buscar stats finais
      const { data: stats } = await supabase
        .from('whatsapp_campaign_recipients')
        .select('status')
        .eq('campaign_id', campaignId)

      const finalStats = {
        total: stats?.length || 0,
        sent: stats?.filter(r => ['sent', 'delivered', 'read'].includes(r.status)).length || 0,
        delivered: stats?.filter(r => ['delivered', 'read'].includes(r.status)).length || 0,
        read: stats?.filter(r => r.status === 'read').length || 0,
        failed: stats?.filter(r => r.status === 'failed').length || 0,
      }

      await supabase
        .from('whatsapp_campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_sent: finalStats.sent,
          total_delivered: finalStats.delivered,
          total_read: finalStats.read,
          total_failed: finalStats.failed,
        })
        .eq('id', campaignId)

      await this.log(campaignId, 'success', 'Campaign completed', finalStats)
      console.log(`🎉 Campaign ${campaignId} completed!`, finalStats)
    }
  }

  private async log(
    campaignId: string,
    logType: 'info' | 'error' | 'success' | 'warning',
    message: string,
    details?: any
  ): Promise<void> {
    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: campaignId,
      log_type: logType,
      message,
      details,
    })
  }
}

// =============================================
// SINGLETON
// =============================================

export const campaignProcessor = new CampaignProcessor()

// =============================================
// EXPORTS
// =============================================
export default CampaignProcessor
