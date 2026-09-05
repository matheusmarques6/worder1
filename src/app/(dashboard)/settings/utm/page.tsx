'use client'

// Configurações → Parâmetros UTM (desenho PUtm v3, estilo Klaviyo): cada
// parâmetro escolhe uma variável (ou texto fixo) para campanhas e para fluxos.
// Configuração POR LOJA; sem loja selecionada, edita o padrão da organização.

import { useEffect, useMemo, useState } from 'react'
import { useStoreStore } from '@/stores'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, SaveBar, Title, LoadingCard, Tog, Badge, IconBtn, Code } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api } from '@/components/settings/format'
import { useApi, useSave } from '@/components/settings/hooks'
import {
  DEFAULT_UTM_SETTINGS, IDENT_PARAM_KEYS, MAX_CUSTOM_PARAMS, UTM_KEYS, UTM_VARIABLES, isValidCustomParamKey,
  normalizeUtmSettings, previewLinkUrl, sampleLinkContext,
  type LinkMessageType, type UtmKey, type UtmSettings,
} from '@/lib/tracking/link-params'

type Source = 'store' | 'org' | 'legacy' | 'default'
type Mode = { kind: '' } | { kind: 'static'; value: string } | { kind: 'var'; key: string } | { kind: 'custom'; value: string }

const VAR_LABEL: Record<string, string> = {
  channel: 'Canal (email, whatsapp, sms)', message_type: 'Tipo (campaign / automation)', campaign_name: 'Nome da campanha', campaign_id: 'ID da campanha',
  automation_name: 'Nome do fluxo', automation_id: 'ID do fluxo', message_name: 'Nome da mensagem', message_id: 'ID da mensagem', email_subject: 'Assunto do e-mail',
  ab_variant: 'Variante A/B', send_date: 'Data do envio (AAAA-MM-DD)', store_name: 'Nome da loja', store_domain: 'Domínio da loja', send_id: 'ID do envio',
  contact_id: 'ID do contato', link_text: 'Texto do link', link_index: 'Posição do link',
}

function parseMode(t: string): Mode {
  const s = (t || '').trim()
  if (!s) return { kind: '' }
  const m = s.match(/^\{\{\s*([a-z_]+)\s*\}\}$/i)
  if (m && UTM_VARIABLES.some((v) => v.key === m[1])) return { kind: 'var', key: m[1] }
  if (!s.includes('{{')) return { kind: 'static', value: s }
  return { kind: 'custom', value: s }
}
const toTemplate = (m: Mode) => (m.kind === '' ? '' : m.kind === 'var' ? `{{${m.key}}}` : m.value)

function VarSelect({ value, onChange, scope, disabled }: { value: string; onChange: (t: string) => void; scope: LinkMessageType; disabled?: boolean }) {
  const mode = parseMode(value)
  const vars = UTM_VARIABLES.filter((v) => v.scope === 'all' || v.scope === 'link' || v.scope === scope)
  const sel = mode.kind === '' ? '' : mode.kind === 'var' ? mode.key : mode.kind
  return (
    <div className="usel">
      <select className="in" value={sel} disabled={disabled} aria-label={scope === 'campaign' ? 'Valor em campanhas' : 'Valor em fluxos'} onChange={(e) => {
        const k = e.target.value
        if (k === '') onChange('')
        else if (k === 'static') onChange(mode.kind === 'static' ? mode.value : mode.kind === 'custom' ? mode.value.replace(/\{\{.*?\}\}/g, '').trim() || 'worder' : 'worder')
        else if (k === 'custom') onChange(mode.kind === 'custom' ? mode.value : mode.kind === 'var' ? `{{${mode.key}}}` : mode.kind === 'static' ? mode.value : '{{campaign_name}}')
        else onChange(`{{${k}}}`)
      }}>
        <option value="">— Não incluir —</option>
        <option value="static">Texto fixo</option>
        {vars.map((v) => <option key={v.key} value={v.key}>{VAR_LABEL[v.key] || v.label}</option>)}
        <option value="custom">Personalizado (combinar variáveis)</option>
      </select>
      {mode.kind === 'static' && <input className="in" value={mode.value} placeholder="valor" disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="Texto fixo" />}
      {mode.kind === 'custom' && <input className="in mono" value={mode.value} placeholder="ex.: {{campaign_name}}-{{send_date}}" disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="Template personalizado" style={{ flex: '2 1 200px' }} />}
    </div>
  )
}

export default function UtmSettingsPage() {
  const { currentStore, _hasHydrated } = useStoreStore() as any
  const storeId: string | null = currentStore?.id || null
  const toast = useToast()
  const confirm = useConfirm()
  const { data, loading, error, reload } = useApi<{ settings: any; source: Source; store: { name: string } | null }>(_hasHydrated ? `/api/settings/utm${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}` : null, [storeId])
  const [s, setS] = useState<UtmSettings>(DEFAULT_UTM_SETTINGS)
  const [orig, setOrig] = useState<UtmSettings>(DEFAULT_UTM_SETTINGS)
  useEffect(() => { if (data) { const n = normalizeUtmSettings(data.settings); setS(n); setOrig(n) } }, [data])
  const dirty = JSON.stringify(s) !== JSON.stringify(orig)
  const { saving, error: saveErr, save } = useSave()
  const [busy, setBusy] = useState(false)

  const setT = (scope: LinkMessageType, k: UtmKey, t: string) => setS((o) => ({ ...o, [scope]: { ...o[scope], [k]: t } }))
  const setCustom = (i: number, patch: Partial<{ key: string; campaign: string; automation: string }>) => setS((o) => ({ ...o, custom: o.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  const onSave = () => save(async () => {
    const bad = s.custom.find((c) => !isValidCustomParamKey(c.key))
    if (bad) throw new Error(`“${bad.key || '(vazio)'}” não pode ser usado como parâmetro. Use letras, números, _ ou -, sem repetir as UTMs padrão.`)
    const dup = s.custom.map((c) => c.key).find((k, i, a) => a.indexOf(k) !== i)
    if (dup) throw new Error(`Parâmetro “${dup}” repetido.`)
    const r = await api<{ settings: any }>('/api/settings/utm', { method: 'PATCH', json: { storeId, settings: s } })
    const n = normalizeUtmSettings(r.settings); setS(n); setOrig(n)
    reload(true)
  }, 'Parâmetros UTM salvos')

  const inherit = async () => {
    if (!storeId) return
    if (!(await confirm.confirm({ title: 'Voltar a herdar o padrão da organização?', description: 'A configuração própria desta loja é apagada.', confirmLabel: 'Voltar a herdar' }))) return
    setBusy(true)
    try { await api('/api/settings/utm', { method: 'PATCH', json: { storeId, reset: true } }); await reload(true); toast.success('Pronto', 'A loja voltou a herdar o padrão.') }
    catch (e: any) { toast.error('Não foi possível', e.message) } finally { setBusy(false) }
  }
  const restore = () => setS({ ...DEFAULT_UTM_SETTINGS, custom: [] })

  const preview = useMemo(() => {
    try { return previewLinkUrl(s, sampleLinkContext('campaign', 'email'), 'https://drgroot.com.br/produto') } catch { return '' }
  }, [s])
  const scopeLabel = data?.source === 'store' ? 'Configuração desta loja' : data?.source === 'org' ? (storeId ? 'Herdando o padrão da organização' : 'Padrão da organização') : data?.source === 'legacy' ? 'Padrão antigo da organização' : 'Padrão Worder'

  if (!_hasHydrated || (loading && !data)) return <><Title h="Parâmetros UTM" p="Adicionados a todos os links para que Google Analytics e Shopify reconheçam o tráfego do Worder." /><LoadingCard rows={1} /><LoadingCard rows={6} /></>
  if (error) return <><Title h="Parâmetros UTM" /><Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card></>

  const bar = <SaveBar dirty={dirty} saving={saving} error={saveErr} onSave={onSave} onCancel={() => setS(orig)} hint={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Badge k={data?.source === 'store' ? 'acc' : 'off'} dot={false}>{scopeLabel}</Badge>{storeId && data?.source === 'store' && <button type="button" className="btn btn-link" onClick={inherit} disabled={busy}>Voltar a herdar</button>}<button type="button" className="btn btn-link" onClick={restore}>Restaurar padrão Worder</button></span>} />

  return (
    <>
      <Title h="Parâmetros UTM" p="Adicionados a todos os links para que Google Analytics e Shopify reconheçam o tráfego do Worder. Você pode usar valores fixos ou variáveis dinâmicas." />
      <Card foot={bar}>
        <Row tg label="Adicionar UTMs automaticamente" help="Links que já tiverem UTM não são sobrescritos."><Tog on={s.enabled} set={(v) => setS((o) => ({ ...o, enabled: v }))} label="Adicionar UTMs automaticamente" /></Row>
      </Card>

      <Card title="Parâmetros padrão" desc="Defina um valor para campanhas e outro para fluxos." flush>
        <div className="tw"><table className="utbl">
          <thead><tr><th>Parâmetro</th><th>Campanhas</th><th>Fluxos</th></tr></thead>
          <tbody>
            {UTM_KEYS.map((k) => (
              <tr key={k}>
                <td className="p">{k}</td>
                <td><VarSelect scope="campaign" value={s.campaign[k]} onChange={(t) => setT('campaign', k, t)} disabled={!s.enabled} /></td>
                <td><VarSelect scope="automation" value={s.automation[k]} onChange={(t) => setT('automation', k, t)} disabled={!s.enabled} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      <Card title="Parâmetros personalizados" desc="Qualquer parâmetro extra que seu analytics espere." right={<button type="button" className="btn btn-sm" disabled={s.custom.length >= MAX_CUSTOM_PARAMS || !s.enabled} onClick={() => setS((o) => ({ ...o, custom: [...o.custom, { key: '', campaign: '', automation: '' }] }))}><I n="plus" s={14} />Adicionar</button>} flush>
        <div className="tw"><table className="utbl">
          <thead><tr><th>Parâmetro</th><th>Campanhas</th><th>Fluxos</th><th></th></tr></thead>
          <tbody>
            {s.custom.map((c, i) => (
              <tr key={i}>
                <td className="p"><input className={'in mono' + (c.key && !isValidCustomParamKey(c.key) ? ' err' : '')} style={{ width: 150 }} value={c.key} placeholder="nome_param" onChange={(e) => setCustom(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} aria-label="Nome do parâmetro" /></td>
                <td><VarSelect scope="campaign" value={c.campaign} onChange={(t) => setCustom(i, { campaign: t })} /></td>
                <td><VarSelect scope="automation" value={c.automation} onChange={(t) => setCustom(i, { automation: t })} /></td>
                <td className="r"><IconBtn n="x" title="Remover" className="del" onClick={() => setS((o) => ({ ...o, custom: o.custom.filter((_, j) => j !== i) }))} /></td>
              </tr>
            ))}
            {!s.custom.length && <tr><td colSpan={4} className="empty2" style={{ padding: 24 }}>Nenhum parâmetro personalizado.</td></tr>}
          </tbody>
        </table></div>
      </Card>

      <Card title="Pré-visualização" desc="Como um link de campanha ficará. Além das UTMs, todo link leva os parâmetros de identificação que o pixel da loja usa para atribuir vendas.">
        <Code wrap>{preview}</Code>
        <div className="pillrow" style={{ margin: '12px 0 16px' }}>{IDENT_PARAM_KEYS.map((k) => <span key={k} className="pill2" title="Parâmetro de identificação — sempre incluído">{k}</span>)}</div>
      </Card>
    </>
  )
}
