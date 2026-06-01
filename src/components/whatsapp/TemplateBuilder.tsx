'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  validateTemplateLocally,
  type TemplateInput,
  type TemplateComponent,
  type TemplateButton,
  type ValidationResult,
} from '@/lib/whatsapp/template-validation'
import {
  Plus, Trash2, AlertCircle, CheckCircle, Eye,
  Type, FileText, Link2, Phone, Hash, MessageSquare
} from 'lucide-react'

export interface TemplateAccountOption {
  id: string
  phone_number: string
  phone_display_name?: string | null
}

export interface TemplateSubmitPayload extends TemplateInput {
  accountId: string
}

// Shape accepted to pre-fill the builder (e.g. editing a rejected
// template). Accepts either Meta `components` or the flat DB columns.
export interface TemplateInitialValue {
  accountId?: string
  name?: string
  language?: string
  category?: string
  components?: any[]
  header_text?: string | null
  body_text?: string | null
  footer_text?: string | null
  buttons?: any[] | null
}

// =============================================
// Types
// =============================================

type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'

interface TemplateBuilderProps {
  accounts: TemplateAccountOption[]
  onSubmit?: (template: TemplateSubmitPayload) => void | Promise<void>
  isSubmitting?: boolean
  className?: string
  /** Pre-fill the form (e.g. duplicate/edit a rejected template). */
  initialValue?: TemplateInitialValue
}

interface FormState {
  accountId: string
  name: string
  language: string
  category: Category
  headerText: string
  headerExamples: string[]
  bodyText: string
  bodyExamples: string[]
  footerText: string
  buttons: TemplateButton[]
}

const VAR_REGEX = /\{\{(\d+)\}\}/g

function countVars(text: string): number {
  const matches = text.match(VAR_REGEX)
  return matches ? matches.length : 0
}

// =============================================
// Constants
// =============================================

const LANGUAGES = [
  { value: 'pt_BR', label: 'Portugues (BR)' },
  { value: 'en_US', label: 'Ingles (US)' },
  { value: 'es', label: 'Espanhol' },
]

const CATEGORIES: { value: Category; label: string; description: string }[] = [
  { value: 'MARKETING', label: 'Marketing', description: 'Promocoes e ofertas' },
  { value: 'UTILITY', label: 'Utilidade', description: 'Atualizacoes de pedidos e contas' },
  { value: 'AUTHENTICATION', label: 'Autenticacao', description: 'Codigos de verificacao' },
]

const INITIAL_STATE: FormState = {
  accountId: '',
  name: '',
  language: 'pt_BR',
  category: 'MARKETING',
  headerText: '',
  headerExamples: [],
  bodyText: '',
  bodyExamples: [],
  footerText: '',
  buttons: [],
}

const VALID_CATEGORIES: Category[] = ['MARKETING', 'UTILITY', 'AUTHENTICATION']

// Build a FormState from a stored template (Meta `components` or flat
// columns). Used to pre-fill the builder when editing/resubmitting.
function buildInitialState(initial: TemplateInitialValue | undefined, accountId: string): FormState {
  if (!initial) return { ...INITIAL_STATE, accountId }

  const category = (initial.category || '').toUpperCase() as Category
  let headerText = initial.header_text || ''
  let headerExamples: string[] = []
  let bodyText = initial.body_text || ''
  let bodyExamples: string[] = []
  let footerText = initial.footer_text || ''
  let buttons: TemplateButton[] = Array.isArray(initial.buttons)
    ? (initial.buttons as TemplateButton[])
    : []

  // Prefer Meta `components` when available (synced templates).
  if (Array.isArray(initial.components) && initial.components.length > 0) {
    for (const comp of initial.components) {
      if (comp.type === 'HEADER' && (comp.format === 'TEXT' || !comp.format)) {
        headerText = comp.text || ''
        const ex = comp.example?.header_text
        if (Array.isArray(ex)) headerExamples = ex.map((v: any) => String(v ?? ''))
      } else if (comp.type === 'BODY') {
        bodyText = comp.text || ''
        const ex = comp.example?.body_text?.[0]
        if (Array.isArray(ex)) bodyExamples = ex.map((v: any) => String(v ?? ''))
      } else if (comp.type === 'FOOTER') {
        footerText = comp.text || ''
      } else if (comp.type === 'BUTTONS') {
        buttons = (comp.buttons || []).map((b: any) => ({
          type: b.type,
          text: b.text || '',
          url: b.url,
          phone_number: b.phone_number,
        }))
      }
    }
  }

  // Ensure example arrays match the variable counts.
  const bodyVars = countVars(bodyText)
  bodyExamples = bodyExamples.slice(0, bodyVars)
  while (bodyExamples.length < bodyVars) bodyExamples.push('')
  const headerVars = countVars(headerText)
  headerExamples = headerExamples.slice(0, headerVars)
  while (headerExamples.length < headerVars) headerExamples.push('')

  return {
    accountId: initial.accountId || accountId,
    name: initial.name || '',
    language: initial.language || 'pt_BR',
    category: VALID_CATEGORIES.includes(category) ? category : 'MARKETING',
    headerText,
    headerExamples,
    bodyText,
    bodyExamples,
    footerText,
    buttons,
  }
}

// =============================================
// Component
// =============================================

export function TemplateBuilder({
  accounts,
  onSubmit,
  isSubmitting = false,
  className,
  initialValue,
}: TemplateBuilderProps) {
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(initialValue, accounts.length === 1 ? accounts[0].id : ''),
  )

  // Sync example arrays whenever variables appear/disappear in the
  // body or header. Truncates extras; pads with '' when new vars appear.
  const bodyVarCount = countVars(form.bodyText)
  const headerVarCount = countVars(form.headerText)

  useEffect(() => {
    setForm(prev => {
      if (prev.bodyExamples.length === bodyVarCount) return prev
      const next = prev.bodyExamples.slice(0, bodyVarCount)
      while (next.length < bodyVarCount) next.push('')
      return { ...prev, bodyExamples: next }
    })
  }, [bodyVarCount])

  useEffect(() => {
    setForm(prev => {
      if (prev.headerExamples.length === headerVarCount) return prev
      const next = prev.headerExamples.slice(0, headerVarCount)
      while (next.length < headerVarCount) next.push('')
      return { ...prev, headerExamples: next }
    })
  }, [headerVarCount])

  // Build the TemplateInput for validation
  const templateInput = useMemo((): TemplateInput => {
    const components: TemplateComponent[] = []

    if (form.headerText.trim()) {
      const headerComp: TemplateComponent = { type: 'HEADER', format: 'TEXT', text: form.headerText }
      if (form.headerExamples.length > 0) {
        headerComp.example = { header_text: form.headerExamples }
      }
      components.push(headerComp)
    }

    const bodyComp: TemplateComponent = { type: 'BODY', text: form.bodyText }
    if (form.bodyExamples.length > 0) {
      bodyComp.example = { body_text: [form.bodyExamples] }
    }
    components.push(bodyComp)

    if (form.footerText.trim()) {
      components.push({ type: 'FOOTER', text: form.footerText })
    }

    if (form.buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons: form.buttons })
    }

    return {
      name: form.name,
      category: form.category,
      language: form.language,
      components,
    }
  }, [form])

  // Real-time validation
  const validation: ValidationResult = useMemo(
    () => validateTemplateLocally(templateInput),
    [templateInput]
  )

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const addButton = useCallback((type: ButtonType) => {
    if (form.buttons.length >= 10) return
    const btn: TemplateButton = { type, text: '' }
    if (type === 'URL') btn.url = ''
    if (type === 'PHONE_NUMBER') btn.phone_number = ''
    setForm(prev => ({ ...prev, buttons: [...prev.buttons, btn] }))
  }, [form.buttons.length])

  const updateButton = useCallback((index: number, updates: Partial<TemplateButton>) => {
    setForm(prev => ({
      ...prev,
      buttons: prev.buttons.map((b, i) => i === index ? { ...b, ...updates } : b),
    }))
  }, [])

  const removeButton = useCallback((index: number) => {
    setForm(prev => ({
      ...prev,
      buttons: prev.buttons.filter((_, i) => i !== index),
    }))
  }, [])

  const insertVariable = useCallback(() => {
    const matches = form.bodyText.match(/\{\{(\d+)\}\}/g) || []
    const nextIndex = matches.length + 1
    updateField('bodyText', form.bodyText + `{{${nextIndex}}}`)
  }, [form.bodyText, updateField])

  const handleSubmit = useCallback(async () => {
    if (!validation.valid || !onSubmit || !form.accountId) return
    await onSubmit({ ...templateInput, accountId: form.accountId })
  }, [validation.valid, onSubmit, templateInput, form.accountId])

  const updateBodyExample = useCallback((idx: number, value: string) => {
    setForm(prev => {
      const next = prev.bodyExamples.slice()
      next[idx] = value
      return { ...prev, bodyExamples: next }
    })
  }, [])

  const updateHeaderExample = useCallback((idx: number, value: string) => {
    setForm(prev => {
      const next = prev.headerExamples.slice()
      next[idx] = value
      return { ...prev, headerExamples: next }
    })
  }, [])

  // Errors organized by field
  const errorsByField = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const issue of validation.errors) {
      if (!map[issue.field]) map[issue.field] = []
      map[issue.field].push(issue.message)
    }
    return map
  }, [validation.errors])

  const fieldError = (field: string): string | undefined => {
    return errorsByField[field]?.[0]
  }

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-6', className)}>
      {/* =================== FORM PANEL =================== */}
      <div className="space-y-5">
        {/* Account selector */}
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Criar para conta WhatsApp
          </label>
          {accounts.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Nenhuma conta WhatsApp Cloud configurada. Conecte uma em
              WhatsApp &gt; Configuracoes.
            </p>
          ) : (
            <select
              value={form.accountId}
              disabled={accounts.length === 1}
              onChange={e => updateField('accountId', e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all disabled:bg-gray-50 disabled:text-gray-700"
            >
              {accounts.length > 1 && <option value="">Selecione uma conta...</option>}
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.phone_display_name ? `${a.phone_display_name} - ` : ''}
                  {a.phone_number}
                </option>
              ))}
            </select>
          )}
          {!form.accountId && accounts.length > 1 && (
            <p className="mt-1.5 text-xs text-gray-500">
              Templates sao criados por conta WhatsApp.
            </p>
          )}
        </div>

        {/* Name */}
        <Input
          label="Nome do Template"
          placeholder="ex: pedido_confirmado"
          value={form.name}
          onChange={e => updateField('name', e.target.value)}
          error={form.name.length > 0 ? fieldError('name') : undefined}
        />

        {/* Language */}
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Idioma
          </label>
          <select
            value={form.language}
            onChange={e => updateField('language', e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          {fieldError('language') && (
            <p className="mt-1.5 text-sm text-error-400">{fieldError('language')}</p>
          )}
        </div>

        {/* Category */}
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Categoria
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                type="button"
                onClick={() => updateField('category', cat.value)}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all',
                  form.category === cat.value
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                )}
              >
                <p className={cn(
                  'text-sm font-medium',
                  form.category === cat.value ? 'text-brand-700' : 'text-gray-700'
                )}>
                  {cat.label}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{cat.description}</p>
              </button>
            ))}
          </div>
          {fieldError('category') && (
            <p className="mt-1.5 text-sm text-error-400">{fieldError('category')}</p>
          )}
        </div>

        {/* Header (optional) */}
        <div>
          <Input
            label="Cabecalho (opcional)"
            placeholder="Texto do cabecalho"
            value={form.headerText}
            onChange={e => updateField('headerText', e.target.value)}
            error={fieldError('header.text') || fieldError('header')}
            rightIcon={
              <span className="text-[10px] text-gray-400">{form.headerText.length}/60</span>
            }
          />
          {headerVarCount > 0 && (
            <div className="mt-2 space-y-2 pl-3 border-l-2 border-amber-200">
              <p className="text-xs font-medium text-amber-700">
                Exemplos das variaveis do cabecalho
              </p>
              {form.headerExamples.map((value, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={value}
                  onChange={e => updateHeaderExample(idx, e.target.value)}
                  placeholder={`Exemplo para {{${idx + 1}}}`}
                  className={cn(
                    'w-full bg-white border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition-all',
                    !value.trim()
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-gray-200 focus:border-brand-500',
                  )}
                />
              ))}
              <p className="text-[11px] text-gray-500">
                Obrigatorio para aprovacao Meta.
              </p>
            </div>
          )}
        </div>

        {/* Body */}
        <div>
          <Textarea
            label="Corpo da Mensagem"
            placeholder="Ola {{1}}, seu pedido {{2}} foi confirmado!"
            value={form.bodyText}
            onChange={e => updateField('bodyText', e.target.value)}
            error={fieldError('body.text') || fieldError('body')}
            rows={5}
          />
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={insertVariable}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
            >
              <Hash className="w-3.5 h-3.5" />
              Inserir variavel
            </button>
            <span className="text-xs text-gray-400">{form.bodyText.length}/1024</span>
          </div>
          {bodyVarCount > 0 && (
            <div className="mt-3 space-y-2 pl-3 border-l-2 border-amber-200">
              <p className="text-xs font-medium text-amber-700">
                Exemplos das variaveis do corpo
              </p>
              {form.bodyExamples.map((value, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={value}
                  onChange={e => updateBodyExample(idx, e.target.value)}
                  placeholder={`Exemplo para {{${idx + 1}}} (ex: ${idx === 0 ? 'Joao' : idx === 1 ? '#12345' : 'valor'})`}
                  className={cn(
                    'w-full bg-white border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition-all',
                    !value.trim()
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-gray-200 focus:border-brand-500',
                  )}
                />
              ))}
              <p className="text-[11px] text-gray-500">
                Obrigatorio para aprovacao Meta — o preview ao lado usa estes valores.
              </p>
            </div>
          )}
        </div>

        {/* Footer (optional) */}
        <Input
          label="Rodape (opcional)"
          placeholder="Worder - Mensagens inteligentes"
          value={form.footerText}
          onChange={e => updateField('footerText', e.target.value)}
          error={fieldError('footer.text')}
          rightIcon={
            <span className="text-[10px] text-gray-400">{form.footerText.length}/60</span>
          }
        />

        {/* Buttons */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Botoes (opcional)
          </label>

          <div className="space-y-2 mb-3">
            {form.buttons.map((btn, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={btn.type === 'QUICK_REPLY' ? 'primary' : btn.type === 'URL' ? 'success' : 'warning'} size="sm">
                      {btn.type === 'QUICK_REPLY' ? 'Resposta' : btn.type === 'URL' ? 'URL' : 'Telefone'}
                    </Badge>
                    <input
                      type="text"
                      placeholder="Texto do botao"
                      value={btn.text}
                      onChange={e => updateButton(idx, { text: e.target.value })}
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500 transition-all"
                    />
                  </div>
                  {btn.type === 'URL' && (
                    <input
                      type="url"
                      placeholder="https://example.com"
                      value={btn.url || ''}
                      onChange={e => updateButton(idx, { url: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500 transition-all"
                    />
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <input
                      type="tel"
                      placeholder="+5511999999999"
                      value={btn.phone_number || ''}
                      onChange={e => updateButton(idx, { phone_number: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-brand-500 transition-all"
                    />
                  )}
                  {fieldError(`buttons[${idx}].text`) && (
                    <p className="text-xs text-error-400">{fieldError(`buttons[${idx}].text`)}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeButton(idx)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {form.buttons.length < 10 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addButton('QUICK_REPLY')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Resposta Rapida
              </button>
              <button
                type="button"
                onClick={() => addButton('URL')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                URL
              </button>
              <button
                type="button"
                onClick={() => addButton('PHONE_NUMBER')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                Telefone
              </button>
            </div>
          )}

          {fieldError('buttons') && (
            <p className="mt-1.5 text-sm text-error-400">{fieldError('buttons')}</p>
          )}
        </div>

        {/* Validation Summary */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="space-y-2">
            {validation.errors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-red-700">
                    {validation.errors.length} erro(s)
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {validation.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-xs text-red-600">- {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-amber-700">
                    {validation.warnings.length} aviso(s)
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {validation.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-600">- {w.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!validation.valid || isSubmitting || !form.accountId}
          isLoading={isSubmitting}
          className="w-full"
          leftIcon={validation.valid && form.accountId ? <CheckCircle className="w-4 h-4" /> : undefined}
        >
          {!form.accountId
            ? 'Selecione uma conta WhatsApp'
            : validation.valid
              ? 'Enviar para Aprovacao'
              : 'Corrija os erros acima'}
        </Button>
      </div>

      {/* =================== PREVIEW PANEL =================== */}
      <div className="lg:sticky lg:top-6 self-start">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Preview</span>
        </div>

        <TemplatePreview form={form} />
      </div>
    </div>
  )
}

// =============================================
// Preview Sub-Component
// =============================================

function TemplatePreview({ form }: { form: FormState }) {
  const replaceVars = (text: string, examples: string[]): string => {
    return text.replace(/\{\{(\d+)\}\}/g, (_, num) => {
      const idx = parseInt(num, 10) - 1
      return examples[idx]?.trim() || `{{${num}}}`
    })
  }

  return (
    <div className="bg-[#e5ddd5] rounded-2xl p-6 min-h-[400px]">
      {/* Phone frame header */}
      <div className="bg-[#075e54] rounded-t-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-white text-sm font-medium">Preview do Template</p>
          <p className="text-white/60 text-xs">WhatsApp Business</p>
        </div>
      </div>

      {/* Chat area */}
      <div className="bg-[#e5ddd5] px-4 py-6 space-y-1">
        {/* Message bubble */}
        <div className="max-w-[85%] bg-white rounded-xl rounded-tl-sm shadow-sm overflow-hidden">
          {/* Header */}
          {form.headerText.trim() && (
            <div className="px-3 pt-2">
              <p className="text-sm font-semibold text-gray-900">
                {replaceVars(form.headerText, form.headerExamples)}
              </p>
            </div>
          )}

          {/* Body */}
          <div className="px-3 py-2">
            {form.bodyText.trim() ? (
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {replaceVars(form.bodyText, form.bodyExamples)}
              </p>
            ) : (
              <p className="text-sm text-gray-300 italic">
                Digite o corpo da mensagem...
              </p>
            )}
          </div>

          {/* Footer */}
          {form.footerText.trim() && (
            <div className="px-3 pb-1">
              <p className="text-xs text-gray-400">{form.footerText}</p>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex justify-end px-3 pb-2">
            <span className="text-[10px] text-gray-400">12:00</span>
          </div>

          {/* Buttons */}
          {form.buttons.length > 0 && (
            <div className="border-t border-gray-100">
              {form.buttons.map((btn, idx) => (
                <button
                  key={idx}
                  className="w-full px-3 py-2.5 text-sm text-[#00a5f4] font-medium text-center border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {btn.type === 'URL' && <Link2 className="w-3.5 h-3.5" />}
                  {btn.type === 'PHONE_NUMBER' && <Phone className="w-3.5 h-3.5" />}
                  {btn.text || `Botao ${idx + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TemplateBuilder
