'use client'

import { useState } from 'react'
import { Modal } from '../proto/ui'

export type SourceKind = 'site' | 'text' | 'doc' | 'qa'

const TITLES: Record<SourceKind, string> = { site: 'Página da loja', text: 'Texto', doc: 'Documento', qa: 'Perguntas e respostas' }

/**
 * Fonte nova: página da loja, texto, documento ou P&R. No Construtor vem da
 * paleta, já com o tipo e o agente (`agentId`). No Conhecimento (Importar)
 * vem com `agents`: o lojista escolhe o tipo e quem lê.
 */
export default function NewSource({ kind: initial, agentId, agents, onClose, onDone }: {
  kind: SourceKind
  agentId?: string
  agents?: Array<{ id: string; name: string; status: string }>
  onClose: () => void
  onDone: (msg: string, sourceId?: string) => Promise<void> | void
}) {
  const [kind, setKind] = useState<SourceKind>(initial)
  const [readers, setReaders] = useState<string[]>(() => (agents ?? []).filter((a) => a.status === 'active').map((a) => a.id))
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const who = agentId ? [agentId] : readers

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      // Página e documento ainda entram pela rota do agente: precisa de um.
      if ((kind === 'site' || kind === 'doc') && who.length === 0) throw new Error('Escolha ao menos um agente que vai ler')
      let res: Response
      if (kind === 'site') {
        res = await fetch(`/api/ai/agents/${who[0]}/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_type: 'url', name: name || url, url }) })
      } else if (kind === 'text') {
        res = await fetch('/api/ai/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, body_markdown: text, agent_ids: who }) })
      } else if (kind === 'qa') {
        res = await fetch('/api/ai/knowledge/import/csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: text, mode: 'faq', agent_ids: who }) })
      } else {
        if (!file) throw new Error('Escolha um arquivo')
        const form = new FormData()
        form.append('file', file)
        res = await fetch(`/api/ai/agents/${who[0]}/sources/upload`, { method: 'POST', body: form })
      }
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Não foi possível criar a fonte')
      const id: string | undefined = body?.source?.id ?? body?.note?.id
      if (id && (kind === 'site' || kind === 'doc') && who.length > 1) {
        await fetch(`/api/ai/knowledge/${id}/agents`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_ids: who }) })
      }
      await onDone('Fonte adicionada. Processando…', id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={agents ? 'Importar para o conhecimento' : `Nova fonte: ${TITLES[kind]}`} onClose={onClose} width={520}
      sub={agents ? 'Arquivo, link do site, texto ou CSV de perguntas. Os agentes passam a consultar quando o processamento terminar.' : 'O agente passa a consultar o conteúdo assim que o processamento terminar.'}
      footer={<><span className="l" style={{ color: 'var(--er)' }}>{error}</span><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn pri" disabled={busy} onClick={() => void submit()}>{agents ? 'Importar' : 'Adicionar'}</button></>}>
      <div style={{ display: 'grid', gap: 12, paddingBottom: 8 }}>
        {agents && (
          <div className="w-seg" style={{ display: 'flex' }}>
            {(Object.keys(TITLES) as SourceKind[]).map((k) => <button key={k} type="button" className={kind === k ? 'on' : ''} style={{ flex: 1 }} onClick={() => setKind(k)}>{TITLES[k]}</button>)}
          </div>
        )}
        {kind !== 'qa' && kind !== 'doc' && <div><label className="flbl">Nome</label><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'site' ? 'Tabela de medidas' : 'Garantia e assistência'} /></div>}
        {kind === 'site' && <div><label className="flbl">Endereço da página</label><input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sualoja.com.br/pages/medidas" /></div>}
        {kind === 'text' && <div><label className="flbl">Texto</label><textarea className="field" rows={8} value={text} onChange={(e) => setText(e.target.value)} /></div>}
        {kind === 'qa' && <div><label className="flbl">CSV com pergunta e resposta</label><textarea className="field" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'pergunta,resposta\nQual o prazo?,De 2 a 4 dias úteis'} /></div>}
        {kind === 'doc' && <div><label className="flbl">Arquivo PDF, DOCX ou TXT</label><input className="field" type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ paddingTop: 8 }} /></div>}
        {agents && (
          <div>
            <label className="flbl">Lida por</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {agents.map((a) => {
                const on = readers.includes(a.id)
                return (
                  <button key={a.id} type="button" className={on ? 'kp-ag' : 'kp-add'} aria-pressed={on}
                    onClick={() => setReaders((r) => (r.includes(a.id) ? r.filter((x) => x !== a.id) : [...r, a.id]))}>{a.name}</button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
