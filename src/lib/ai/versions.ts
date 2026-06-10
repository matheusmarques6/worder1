// =============================================
// Serviço de versionamento de agentes (Bloco F1)
//
// Escreve via service role (o caller passa getSupabaseAdmin()). RLS da
// tabela ai_agent_versions é SELECT-only por org — igual a agent_traces.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { diffLines, hasVersionableChanges, type DiffLine, type VersionableField } from './diff'

export type VersionStatus = 'produção' | 'rascunho' | 'arquivada'

export interface VersionListItem {
  id: string
  tag: string
  label: string
  author: string
  /** ISO created_at */
  date: string
  status: VersionStatus
  current: boolean
  /** diff do system_prompt vs a versão anterior (a mais antiga compara com '') */
  diff: DiffLine[]
}

interface AgentVersionableState {
  id: string
  organization_id: string
  system_prompt?: string | null
  persona?: unknown
  settings?: unknown
}

interface IncomingVersionableFields {
  system_prompt?: unknown
  persona?: unknown
  settings?: unknown
}

const FIELD_LABELS: Record<VersionableField, string> = {
  system_prompt: 'prompt',
  persona: 'persona',
  settings: 'configurações',
}

/** Valida o user_id enviado pelo cliente contra profiles + org (padrão do plano). */
async function resolveAuthorId(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  organizationId: string
): Promise<string | null> {
  if (!userId) return null
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data?.id ?? null
}

async function archivePreviousProduction(supabase: SupabaseClient, agentId: string): Promise<void> {
  const { error } = await supabase
    .from('ai_agent_versions')
    .update({ status: 'arquivada' })
    .eq('agent_id', agentId)
    .eq('status', 'produção')
  if (error) throw error
}

async function nextVersionNumber(supabase: SupabaseClient, agentId: string): Promise<number> {
  const { data, error } = await supabase
    .from('ai_agent_versions')
    .select('version_number')
    .eq('agent_id', agentId)
    .order('version_number', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0]?.version_number ?? 0) + 1
}

/**
 * Chamado pelo PUT/PATCH de agentes ANTES do update. Se prompt/persona/settings
 * mudaram: garante v1 ("Versão inicial") a partir do estado pré-update quando a
 * tabela está vazia, arquiva a produção anterior e insere a nova versão como
 * 'produção' com o estado pós-update (incoming mesclado sobre o atual).
 */
export async function snapshotIfChanged(
  supabase: SupabaseClient,
  agent: AgentVersionableState,
  incoming: IncomingVersionableFields,
  userId: string | null,
  versionLabel?: string | null
): Promise<void> {
  const changed = hasVersionableChanges(
    { system_prompt: agent.system_prompt, persona: agent.persona, settings: agent.settings },
    incoming
  )
  if (changed.length === 0) return

  const author = await resolveAuthorId(supabase, userId, agent.organization_id)
  let next = await nextVersionNumber(supabase, agent.id)

  if (next === 1) {
    // Tabela vazia: v1 captura o estado PRÉ-update
    const { error: v1Error } = await supabase.from('ai_agent_versions').insert({
      organization_id: agent.organization_id,
      agent_id: agent.id,
      version_number: 1,
      label: 'Versão inicial',
      status: 'produção',
      system_prompt: agent.system_prompt ?? null,
      persona: agent.persona ?? null,
      settings: agent.settings ?? null,
      created_by: author,
    })
    if (v1Error) throw v1Error
    next = 2
  }

  const label =
    typeof versionLabel === 'string' && versionLabel.trim()
      ? versionLabel.trim()
      : `Alteração de ${changed.map((f) => FIELD_LABELS[f]).join(', ')}`

  await archivePreviousProduction(supabase, agent.id)

  const { error: insertError } = await supabase.from('ai_agent_versions').insert({
    organization_id: agent.organization_id,
    agent_id: agent.id,
    version_number: next,
    label,
    status: 'produção',
    system_prompt:
      incoming.system_prompt !== undefined ? incoming.system_prompt : agent.system_prompt ?? null,
    persona: incoming.persona !== undefined ? incoming.persona : agent.persona ?? null,
    settings: incoming.settings !== undefined ? incoming.settings : agent.settings ?? null,
    created_by: author,
  })
  if (insertError) throw insertError
}

/**
 * Restaura o snapshot em ai_agents e registra uma nova versão 'produção'
 * "Reverte para v{n}" (arquivando a produção anterior).
 */
export async function rollbackToVersion(
  supabase: SupabaseClient,
  agentId: string,
  organizationId: string,
  versionId: string,
  userId: string | null
): Promise<void> {
  const { data: version, error: versionError } = await supabase
    .from('ai_agent_versions')
    .select('id, version_number, system_prompt, persona, settings')
    .eq('id', versionId)
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .single()

  if (versionError || !version) {
    throw new Error('Versão não encontrada')
  }

  const { error: updateError } = await supabase
    .from('ai_agents')
    .update({
      system_prompt: version.system_prompt,
      persona: version.persona,
      settings: version.settings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentId)
    .eq('organization_id', organizationId)
  if (updateError) throw updateError

  const author = await resolveAuthorId(supabase, userId, organizationId)
  const next = await nextVersionNumber(supabase, agentId)

  await archivePreviousProduction(supabase, agentId)

  const { error: insertError } = await supabase.from('ai_agent_versions').insert({
    organization_id: organizationId,
    agent_id: agentId,
    version_number: next,
    label: `Reverte para v${version.version_number}`,
    status: 'produção',
    system_prompt: version.system_prompt,
    persona: version.persona,
    settings: version.settings,
    created_by: author,
  })
  if (insertError) throw insertError
}

/**
 * Lista versões (mais nova primeiro) com autor resolvido via profiles
 * (fallback 'Sistema') e diff do prompt vs a versão anterior.
 */
export async function listVersions(
  supabase: SupabaseClient,
  agentId: string,
  organizationId: string
): Promise<VersionListItem[]> {
  const { data: rows, error } = await supabase
    .from('ai_agent_versions')
    .select('id, version_number, label, status, system_prompt, created_by, created_at')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .order('version_number', { ascending: true })
  if (error) throw error

  const versions = rows ?? []
  if (versions.length === 0) return []

  const authorIds = Array.from(
    new Set(versions.map((v) => v.created_by).filter((id): id is string => Boolean(id)))
  )
  const authorNames = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds)
    for (const profile of profiles ?? []) {
      if (profile.full_name) authorNames.set(profile.id, profile.full_name)
    }
  }

  const maxNumber = versions[versions.length - 1].version_number

  return versions
    .map((v, idx) => ({
      id: v.id as string,
      tag: `v${v.version_number}`,
      label: v.label as string,
      author: (v.created_by && authorNames.get(v.created_by)) || 'Sistema',
      date: v.created_at as string,
      status: v.status as VersionStatus,
      current: v.version_number === maxNumber,
      diff: diffLines(idx > 0 ? versions[idx - 1].system_prompt ?? '' : '', v.system_prompt ?? ''),
    }))
    .reverse()
}
