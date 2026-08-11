'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, FlaskConical, Loader2, Plus, Trash2, X } from 'lucide-react'

/**
 * 10.7 — as tools custom do lojista, dentro da área Ferramentas da órbita.
 * Regra dupla na cara da UI: "lê e consulta, nunca concede" — e o toggle de
 * ligar só destrava depois de um teste ok (o CHECK do schema é o juiz final).
 */

interface CustomTool {
  id: string
  name: string
  label: string
  description: string
  when_to_use: string
  endpoint: string
  method: 'GET' | 'POST'
  params: Array<{ name: string; type: string; required?: boolean }>
  enabled: boolean
  last_test_status: 'ok' | 'failed' | null
}

interface ParamDraft { name: string; type: 'string' | 'number' | 'boolean'; required: boolean }

const EMPTY_DRAFT = {
  name: '', label: '', description: '', when_to_use: '',
  endpoint: '', method: 'GET' as 'GET' | 'POST', auth_header_value: '',
}

export default function CustomToolsSection() {
  const [tools, setTools] = useState<CustomTool[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [paramDrafts, setParamDrafts] = useState<ParamDraft[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/custom-tools')
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Erro ao carregar tools')
      setTools(payload.tools ?? [])
    } catch (e: any) {
      setError(e.message)
      setTools([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (id: string, fn: () => Promise<Response>) => {
    setBusy(id)
    setError(null)
    try {
      const res = await fn()
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Falhou')
      await load()
      return payload
    } catch (e: any) {
      setError(e.message)
      return null
    } finally {
      setBusy(null)
    }
  }

  const create = async () => {
    await act('create', () =>
      fetch('/api/ai/custom-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          params: paramDrafts.filter((p) => p.name.trim()),
        }),
      })
    )
    setCreating(false)
    setDraft(EMPTY_DRAFT)
    setParamDrafts([])
  }

  const draftOk =
    draft.name.trim() && draft.label.trim() && draft.description.trim() &&
    draft.when_to_use.trim() && draft.endpoint.startsWith('https://')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
        Suas ferramentas{' '}
        <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>
          · leem e consultam — nunca concedem benefício
        </span>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
      {tools === null ? (
        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
      ) : (
        <>
          {tools.map((tool) => (
            <div key={tool.id} className={`act-row${tool.enabled ? ' on' : ''}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="act-t" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  {tool.label}
                  <span className="chip" style={{ height: 20, fontSize: 10.5, padding: '0 8px' }}>sua</span>
                  {tool.last_test_status === 'ok' && (
                    <span className="chip chip-green" style={{ height: 20, fontSize: 10.5, padding: '0 8px' }}>teste ok</span>
                  )}
                  {tool.last_test_status === 'failed' && (
                    <span className="chip" style={{ height: 20, fontSize: 10.5, padding: '0 8px', color: 'var(--red)' }}>teste falhou</span>
                  )}
                </div>
                <div className="act-d">{tool.description} <b>Usa quando:</b> {tool.when_to_use}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy === tool.id}
                title="Testar a chamada (obrigatório antes de ligar)"
                onClick={() => act(tool.id, () =>
                  fetch(`/api/ai/custom-tools/${tool.id}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                )}>
                {busy === tool.id ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
              </button>
              <button
                type="button"
                className={`tog${tool.enabled ? ' on' : ''}`}
                style={tool.last_test_status !== 'ok' && !tool.enabled ? { opacity: 0.4 } : undefined}
                title={tool.last_test_status !== 'ok' && !tool.enabled ? 'Teste a chamada antes de ligar' : undefined}
                onClick={() => act(tool.id, () =>
                  fetch(`/api/ai/custom-tools/${tool.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: !tool.enabled }),
                  })
                )}
              />
              <button type="button" className="close-x" style={{ width: 26, height: 26, marginLeft: 0 }}
                onClick={() => act(tool.id, () =>
                  fetch(`/api/ai/custom-tools/${tool.id}`, { method: 'DELETE' })
                )}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {creating ? (
            <div className="card" style={{ padding: 13, borderStyle: 'dashed', display: 'grid', gap: 9 }}>
              {([
                ['name', 'Nome técnico (slug)', 'ex.: frete_kangu'],
                ['label', 'Nome', 'ex.: Calcular frete Kangu'],
                ['description', 'O que ela faz', 'ex.: Consulta a API da Kangu com o CEP'],
                ['when_to_use', 'Quando o agente deve usar', 'ex.: Pedirem valor de frete'],
                ['endpoint', 'Endpoint (https)', 'https://…'],
                ['auth_header_value', 'Auth (opcional — vira secret)', 'ex.: Bearer xyz'],
              ] as const).map(([key, label, ph]) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>{label}</label>
                  <input className="field" style={{ height: 34, fontSize: 12.5 }} placeholder={ph}
                    value={(draft as any)[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)' }}>Método:</span>
                <div className="seg-ctl">
                  {(['GET', 'POST'] as const).map((m) => (
                    <button key={m} type="button" className={draft.method === m ? 'on' : ''}
                      onClick={() => setDraft({ ...draft, method: m })}>{m}</button>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>só leitura/consulta</span>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>
                  Parâmetros tipados
                </label>
                {paramDrafts.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input className="field" style={{ height: 32, fontSize: 12, flex: 1 }} placeholder="nome"
                      value={p.name}
                      onChange={(e) => setParamDrafts(paramDrafts.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} />
                    <select className="field" style={{ height: 32, fontSize: 12, width: 96 }}
                      value={p.type}
                      onChange={(e) => setParamDrafts(paramDrafts.map((x, xi) => xi === i ? { ...x, type: e.target.value as ParamDraft['type'] } : x))}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                    </select>
                    <button type="button" className={`pickchip${p.required ? ' on' : ''}`}
                      onClick={() => setParamDrafts(paramDrafts.map((x, xi) => xi === i ? { ...x, required: !x.required } : x))}>
                      obrigatório
                    </button>
                    <button type="button" className="close-x" style={{ width: 26, height: 26, marginLeft: 0 }}
                      onClick={() => setParamDrafts(paramDrafts.filter((_, xi) => xi !== i))}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-soft btn-sm"
                  onClick={() => setParamDrafts([...paramDrafts, { name: '', type: 'string', required: false }])}>
                  <Plus size={13} />Parâmetro
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={!draftOk || busy === 'create'} onClick={create}>
                  <Check size={14} />Criar (nasce desligada)
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-soft btn-sm" style={{ justifySelf: 'start' }}
              onClick={() => setCreating(true)}>
              <Plus size={14} />Criar ferramenta
            </button>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            Testar a chamada é <b>obrigatório</b> antes de ligar. A descrição e o
            &quot;quando usar&quot; entram no prompt — é assim que o agente decide acionar.
          </div>
        </>
      )}
    </div>
  )
}
