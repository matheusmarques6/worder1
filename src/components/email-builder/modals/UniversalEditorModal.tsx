'use client'

// ═══════════════════════════════════════════════════════════════════
// Editar um conteúdo universal — em cima do e-mail, não noutra aba.
//
// A versão anterior abria `/email/universal/{id}/edit` com target=_blank
// e devolvia a alteração por localStorage. Trocar de aba no meio de uma
// edição perde o fio: a pessoa volta e não sabe se salvou, o que mudou,
// nem onde a mudança caiu.
//
// Aqui o universal abre por cima do e-mail, num painel que só fala dele:
// faixa violeta com o nome, o número de e-mails atingidos e um botão que
// diz o que vai acontecer. Salvar pede confirmação com a lista dos
// e-mails — a alteração some da tela e reaparece em vinte outras, então
// o aviso vem antes, não depois.
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, X, Check, Pencil, AlertTriangle, History, Save } from 'lucide-react'
import {
  UniversalIcon, UniversalUsageList, useUniversalUsage, usageSummary,
  kindLabel, kindNoun, EMPTY_USAGE, type Usage,
} from '../universal/UniversalBits'
import {
  universalToDoc, docToUniversal, universalKindOf, broadcastUniversalSaved, stableJson,
  type UniversalKind,
} from '../universal/universal-doc'
import type { EmailDocument } from '../config/types'

// Carregado sob demanda: o editor é grande, e é ele mesmo que renderiza
// este modal. O import dinâmico nos dois sentidos quebra o ciclo.
const WorderEditor = dynamic(() => import('../WorderEmailEditor'), { ssr: false })

interface SavedRow {
  id: string
  name: string
  category: string | null
  block_json: any
}

export interface UniversalEditorModalProps {
  savedId: string
  onClose: () => void
  /** Chamado depois de salvar, com o conteúdo novo, para o e-mail de trás se atualizar na hora. */
  onSaved?: (info: { id: string; name: string; kind: UniversalKind; content: any; usage: Usage }) => void
  /** Abre o histórico de versões deste universal. */
  onOpenVersions?: (savedId: string) => void
}

export default function UniversalEditorModal({ savedId, onClose, onSaved, onOpenVersions }: UniversalEditorModalProps) {
  const [saved, setSaved] = useState<SavedRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [justSaved, setJustSaved] = useState(0)
  // O editor de dentro roda sem salvamento automático: aqui cada
  // salvamento reescreve dezenas de e-mails, e isso é decisão de quem
  // está editando, não de um temporizador. Guardamos o documento vivo
  // para o botão de salvar ter o que enviar.
  const [liveDoc, setLiveDoc] = useState<Record<string, any> | null>(null)
  const [dirty, setDirty] = useState(false)

  const { usage, loading: usageLoading, reload: reloadUsage } = useUniversalUsage(savedId)
  const kind: UniversalKind = useMemo(() => universalKindOf(saved), [saved])

  // A confirmação acontece no meio do salvamento: o editor espera um
  // booleano, então a resposta do usuário vira a resolução da promessa.
  const decide = useRef<((ok: boolean) => void) | null>(null)
  // "Mudou?" se decide comparando o conteúdo com o que foi aberto, não
  // contando avisos: o editor notifica o documento ao montar, e em
  // desenvolvimento o React monta os efeitos duas vezes.
  const baseline = useRef('')

  useEffect(() => {
    let cancelled = false
    setDirty(false)
    setLoading(true)
    fetch(`/api/email/saved-blocks/${savedId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Conteúdo universal não encontrado'))))
      .then((d) => {
        if (cancelled) return
        if (!d?.block) throw new Error('Conteúdo universal não encontrado')
        setSaved(d.block as SavedRow)
        setName(d.block.name || '')
      })
      .catch((e: any) => { if (!cancelled) setError(e.message || 'Erro ao carregar') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [savedId])

  const design: EmailDocument | null = useMemo(() => universalToDoc(saved), [saved])

  // O ponto de partida da comparação, refeito quando o universal troca
  // ou quando um salvamento passa a ser o novo conteúdo em vigor.
  useEffect(() => {
    baseline.current = design ? stableJson(design.sections) : ''
    setDirty(false)
  }, [design])

  const askConfirmation = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      decide.current = resolve
      setConfirm(true)
    })
  }, [])

  const answer = useCallback((ok: boolean) => {
    setConfirm(false)
    decide.current?.(ok)
    decide.current = null
  }, [])

  const handleSave = useCallback(async (docOut: Record<string, any>) => {
    if (!saved) return false
    const body = docToUniversal(docOut, kind)
    if (!body) {
      setError('Não foi possível ler o conteúdo editado.')
      return false
    }

    // Sem nenhum e-mail usando, salvar não atinge ninguém — não vale
    // um aviso. Com e-mails, a confirmação é o ponto da tela.
    if (usage.count > 0 && !(await askConfirmation())) return false

    setSaving(true)
    try {
      const res = await fetch(`/api/email/saved-blocks/${savedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_json: body, ...(name.trim() && name.trim() !== saved.name ? { name: name.trim() } : {}) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Erro ao salvar')
        return false
      }
      const data = await res.json()
      const freshUsage: Usage = data.usage || usage
      const written: number = typeof data.propagated === 'number' ? data.propagated : freshUsage.count
      broadcastUniversalSaved(savedId)
      setSaved((prev) => (prev ? { ...prev, block_json: body, name: data.block?.name || prev.name } : prev))
      setJustSaved(written)
      baseline.current = stableJson(docOut?.sections ?? [])
      setDirty(false)
      setTimeout(() => setJustSaved(0), 4000)
      reloadUsage()
      onSaved?.({
        id: savedId,
        name: data.block?.name || name || saved.name,
        kind,
        content: kind === 'section' ? body.section : body,
        usage: freshUsage,
      })
      return true
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar')
      return false
    } finally {
      setSaving(false)
    }
  }, [saved, kind, savedId, name, usage, askConfirmation, reloadUsage, onSaved])

  const commitRename = useCallback(async () => {
    const next = name.trim()
    setRenaming(false)
    if (!saved || !next || next === saved.name) { setName(saved?.name || ''); return }
    try {
      const res = await fetch(`/api/email/saved-blocks/${savedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      })
      if (res.ok) {
        setSaved((prev) => (prev ? { ...prev, name: next } : prev))
        broadcastUniversalSaved(savedId)
      } else {
        setName(saved.name)
      }
    } catch {
      setName(saved.name)
    }
  }, [name, saved, savedId])

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('Sair sem salvar? O que você mudou aqui não vai para os e-mails.')) return
    onClose()
  }, [dirty, onClose])

  // ── Chrome ────────────────────────────────────────────────────────

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-[120] bg-white flex flex-col">{children}</div>
  )

  if (loading) {
    return shell(
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
      </div>
    )
  }

  if (!saved || !design) {
    return shell(
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-600">{error || 'Conteúdo universal não encontrado'}</p>
        <button onClick={onClose} className="text-sm font-medium text-violet-600 hover:text-violet-800">
          Voltar ao e-mail
        </button>
      </div>
    )
  }

  return shell(
    <>
      {/* Faixa de contexto: enquanto ela estiver na tela, o que se edita
          não é este e-mail. */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-violet-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-white/15 flex items-center justify-center flex-shrink-0">
            <UniversalIcon kind={kind} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            {renaming ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') { setName(saved.name); setRenaming(false) }
                }}
                className="bg-white/15 rounded px-1.5 py-0.5 text-[13px] font-semibold text-white placeholder-white/50 outline-none border border-white/30 w-56"
              />
            ) : (
              <button
                onClick={() => setRenaming(true)}
                title="Renomear"
                className="group flex items-center gap-1.5 text-[13px] font-semibold leading-tight truncate max-w-[22rem]"
              >
                <span className="truncate">{saved.name}</span>
                <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-70 flex-shrink-0" />
              </button>
            )}
            <p className="text-[11px] text-violet-100 leading-tight">
              {kindLabel(kind)} · o que você mudar aqui vale para{' '}
              {usageLoading ? '…' : usage.count === 0 ? 'os próximos e-mails' : usageSummary(usage)}
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {justSaved > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/15 text-[11px] font-medium">
            <Check className="w-3.5 h-3.5" />
            {justSaved === 0
              ? 'Salvo'
              : `Salvo — ${justSaved} ${justSaved === 1 ? 'e-mail atualizado' : 'e-mails atualizados'}`}
          </span>
        )}
        {onOpenVersions && (
          <button
            onClick={() => onOpenVersions(savedId)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium hover:bg-white/15 transition-colors"
            title="Versões anteriores"
          >
            <History className="w-3.5 h-3.5" /> Histórico
          </button>
        )}
        <button
          onClick={requestClose}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium hover:bg-white/15 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Fechar
        </button>
        {/* Salvar é um ato, não um temporizador: enquanto este botão não
            for clicado, nenhum e-mail muda. */}
        <button
          onClick={() => { if (liveDoc) void handleSave(liveDoc) }}
          disabled={saving || !dirty || !liveDoc}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-white text-violet-700 hover:bg-violet-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {usage.count > 0 ? `Salvar em ${usage.count} e-mail${usage.count === 1 ? '' : 's'}` : 'Salvar'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-[12px] text-red-700 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <WorderEditor
          templateName={saved.name}
          design={design}
          autosave={false}
          onDocChange={(d: any) => {
            setLiveDoc(d)
            setDirty(stableJson(d?.sections ?? []) !== baseline.current)
          }}
          onSave={handleSave}
          onBack={requestClose}
          onRename={(n: string) => setName(n)}
        />
      </div>

      {/* ── Confirmação: quantos e-mails, e quais ── */}
      {confirm && (
        <div className="fixed inset-0 z-[130] bg-black/50 flex items-center justify-center p-4" onClick={() => answer(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-start gap-3 p-5 pb-4">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <UniversalIcon kind={kind} className="w-5 h-5 text-violet-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900">
                  Salvar em {usage.count} {usage.count === 1 ? 'e-mail' : 'e-mails'}?
                </h3>
                <p className="text-[12px] text-gray-500 leading-relaxed mt-1">
                  <strong className="text-gray-700">{saved.name}</strong> é {kindLabel(kind).toLowerCase()}.
                  Salvar troca {kind === 'section' ? 'esta seção' : 'este bloco'} em cada e-mail abaixo —
                  inclusive nos que já estão no ar.
                </p>
              </div>
            </div>

            <div className="px-5 max-h-64 overflow-y-auto border-y border-gray-100 bg-gray-50/50">
              <UniversalUsageList usage={usage} loading={usageLoading} max={20} className="py-2" />
            </div>

            <div className="flex items-center justify-end gap-2 p-4">
              <button
                onClick={() => answer(false)}
                className="px-3.5 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => answer(true)}
                disabled={saving}
                className="px-4 py-2 bg-violet-600 text-white text-[13px] font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar em {usage.count === 1 ? 'todos' : `todos os ${usage.count}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
