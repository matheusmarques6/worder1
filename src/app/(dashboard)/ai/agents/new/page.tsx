'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  ShoppingCart,
  TrendingDown,
  HeartHandshake,
  Headphones,
  Gem,
  Shirt,
  Sparkles,
  PawPrint,
  Home,
  Dumbbell,
  Baby,
  Pizza,
  Boxes,
  Loader2,
  Check,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { F1_TEMPLATES } from '@/lib/ai/templates/v1'
import type { AgentRole, AgentTemplate } from '@/lib/ai/types'

// =============================================
// Wizard de criação de agente — 5 steps.
// Step 1: caso de uso (papel)
// Step 2: vertical / template
// Step 3: variáveis da loja
// Step 4: conectar WhatsApp (link, opcional)
// Step 5: revisar + publicar
// =============================================

type UseCase = 'support' | 'recovery' | 'sales' | 'pre_sales' | 'post_sales' | 'custom'

const USE_CASES: { id: UseCase; label: string; description: string; Icon: typeof ShoppingCart }[] = [
  {
    id: 'support',
    label: 'Atendimento',
    description: 'Responde dúvidas, vende e dá suporte.',
    Icon: ShoppingCart,
  },
  {
    id: 'recovery',
    label: 'Recuperação',
    description: 'Resgata vendas perdidas (carrinho, pix, boleto).',
    Icon: TrendingDown,
  },
  {
    id: 'post_sales',
    label: 'Pós-venda',
    description: 'Acompanha cliente após a compra.',
    Icon: HeartHandshake,
  },
]

const VERTICALS: { id: string; label: string; Icon: typeof Gem; templateId?: string }[] = [
  { id: 'joalheria', label: 'Joalheria', Icon: Gem, templateId: 'joalheria' },
  { id: 'moda', label: 'Moda', Icon: Shirt },
  { id: 'beleza', label: 'Beleza', Icon: Sparkles },
  { id: 'pet', label: 'Pet', Icon: PawPrint },
  { id: 'casa', label: 'Casa', Icon: Home },
  { id: 'fitness', label: 'Fitness', Icon: Dumbbell },
  { id: 'baby', label: 'Baby', Icon: Baby },
  { id: 'delivery', label: 'Delivery', Icon: Pizza },
  { id: 'generico', label: 'Personalizado', Icon: Boxes },
]

const STEPS = ['Uso', 'Vertical', 'Variáveis', 'WhatsApp', 'Revisar'] as const

function pickTemplate(useCase: UseCase, vertical: string): AgentTemplate | undefined {
  if (vertical === 'joalheria') {
    return F1_TEMPLATES.find((t) => t.id === 'joalheria')
  }
  if (useCase === 'recovery') {
    return F1_TEMPLATES.find((t) => t.id === 'recuperacao-generico')
  }
  return F1_TEMPLATES.find((t) => t.id === 'atendimento-generico')
}

export default function AgentWizardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id

  const [step, setStep] = useState(0)
  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const [vertical, setVertical] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [storeVars, setStoreVars] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = useMemo(() => {
    if (!useCase || !vertical) return undefined
    return pickTemplate(useCase, vertical)
  }, [useCase, vertical])

  // Auto-popula store_vars com chaves do template selecionado
  useMemo(() => {
    if (template) {
      const next: Record<string, string> = { ...storeVars }
      for (const k of Object.keys(template.store_variables_template)) {
        if (next[k] === undefined) next[k] = ''
      }
      setStoreVars(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id])

  const canAdvance = (() => {
    if (step === 0) return !!useCase
    if (step === 1) return !!vertical
    if (step === 2) return name.trim().length > 0
    if (step === 3) return true
    return true
  })()

  const handlePublish = async () => {
    if (!template || !organizationId || !useCase) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          name: name.trim(),
          role: useCase,
          status: 'published',
          identity: template.identity,
          behavior: template.behavior,
          persona: template.persona,
          store_variables: storeVars,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.agent) {
        setError(data.error || 'Falha ao criar agente')
        return
      }
      router.push(`/ai/agents/${data.agent.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-zinc-50 overflow-auto">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="text-sm font-semibold text-zinc-900">Novo agente</div>
          <button
            type="button"
            onClick={() => router.push('/ai/agents')}
            className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 transition-colors"
            aria-label="Sair"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="max-w-4xl mx-auto px-6 pb-4">
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border transition-colors ${
                      i < step
                        ? 'bg-orange-500 text-white border-orange-500'
                        : i === step
                        ? 'bg-orange-50 text-orange-700 border-orange-300'
                        : 'bg-white text-zinc-500 border-zinc-200'
                    }`}
                  >
                    {i < step ? <Check className="w-3.5 h-3.5" strokeWidth={2} /> : i + 1}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      i <= step ? 'text-zinc-900' : 'text-zinc-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px ${
                      i < step ? 'bg-orange-300' : 'bg-zinc-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {step === 0 && (
          <Step
            title="O que esse agente vai fazer?"
            subtitle="Você pode criar mais agentes depois."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {USE_CASES.map((uc) => {
                const Icon = uc.Icon
                return (
                  <button
                    key={uc.id}
                    type="button"
                    onClick={() => setUseCase(uc.id)}
                    className={`p-5 bg-white border rounded-xl text-left transition-all ${
                      useCase === uc.id
                        ? 'border-orange-400 ring-2 ring-orange-100'
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-orange-50 mb-3">
                      <Icon className="w-5 h-5 text-orange-600" strokeWidth={1.75} />
                    </div>
                    <div className="font-semibold text-zinc-900">{uc.label}</div>
                    <div className="text-xs text-zinc-500 mt-1">{uc.description}</div>
                  </button>
                )
              })}
            </div>
          </Step>
        )}

        {step === 1 && (
          <Step
            title="Qual o tipo da sua loja?"
            subtitle="Vamos pré-popular o agente com um template otimizado."
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {VERTICALS.map((v) => {
                const Icon = v.Icon
                const hasTemplate = !!v.templateId
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVertical(v.id)}
                    className={`p-4 bg-white border rounded-xl text-left transition-all ${
                      vertical === v.id
                        ? 'border-orange-400 ring-2 ring-orange-100'
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-zinc-700 mb-2" strokeWidth={1.75} />
                    <div className="text-sm font-semibold text-zinc-900">{v.label}</div>
                    {hasTemplate && (
                      <div className="text-xs text-orange-600 mt-1">Template pronto</div>
                    )}
                  </button>
                )
              })}
            </div>
          </Step>
        )}

        {step === 2 && template && (
          <Step
            title="Conte sobre sua loja"
            subtitle="Esses dados serão usados pelo agente automaticamente."
          >
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 uppercase tracking-wide mb-1.5">
                  Nome do agente
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Aurora"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                             focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div className="space-y-3">
                {Object.keys(template.store_variables_template).map((key) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-zinc-600 uppercase tracking-wide mb-1.5">
                      {key}
                    </label>
                    <textarea
                      value={storeVars[key] ?? ''}
                      onChange={(e) =>
                        setStoreVars({ ...storeVars, [key]: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                                 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-y"
                    />
                  </div>
                ))}
              </div>
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step
            title="Conectar WhatsApp"
            subtitle="Você pode conectar agora ou continuar e fazer depois."
          >
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <p className="text-sm text-zinc-700">
                Para o agente responder no WhatsApp você precisa de uma conta Meta Business
                com WhatsApp Cloud API.
              </p>
              <ul className="text-sm text-zinc-600 list-disc pl-5 space-y-1">
                <li>Conta no Meta Business Suite</li>
                <li>Número WhatsApp Business verificado</li>
                <li>Token de acesso permanente do app Meta</li>
              </ul>
              <a
                href="/integrations/whatsapp"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700
                           border border-orange-200 rounded-md text-sm font-medium hover:bg-orange-100"
              >
                Conectar agora
              </a>
              <p className="text-xs text-zinc-500">
                Pode pular este passo — o agente fica em rascunho até o WhatsApp estar
                conectado.
              </p>
            </div>
          </Step>
        )}

        {step === 4 && template && useCase && (
          <Step
            title="Pronto para publicar"
            subtitle="Revise os dados antes de criar o agente."
          >
            <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
              <SummaryRow label="Nome" value={name || '(sem nome)'} />
              <SummaryRow
                label="Papel"
                value={USE_CASES.find((u) => u.id === useCase)?.label ?? useCase}
              />
              <SummaryRow
                label="Vertical"
                value={VERTICALS.find((v) => v.id === vertical)?.label ?? vertical ?? '—'}
              />
              <SummaryRow label="Template" value={template.label} />
              <SummaryRow label="Idioma" value={template.persona.language} />
              <SummaryRow
                label="Variáveis preenchidas"
                value={`${
                  Object.values(storeVars).filter((v) => v.trim().length > 0).length
                } / ${Object.keys(storeVars).length}`}
              />
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                {error}
              </div>
            )}
          </Step>
        )}
      </main>

      <footer className="sticky bottom-0 bg-white border-t border-zinc-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-zinc-700
                       hover:bg-zinc-100 rounded-md transition-colors disabled:opacity-30"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canAdvance}
              className="inline-flex items-center gap-2 px-5 py-2 bg-orange-500 text-white
                         text-sm font-medium rounded-md hover:bg-orange-600 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continuar <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={submitting || !canAdvance}
              className="inline-flex items-center gap-2 px-5 py-2 bg-orange-500 text-white
                         text-sm font-medium rounded-md hover:bg-orange-600 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Check className="w-4 h-4" strokeWidth={1.75} />
              )}
              Publicar
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
      {subtitle && <p className="text-sm text-zinc-500 mt-1 mb-6">{subtitle}</p>}
      {children}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-900">{value}</span>
    </div>
  )
}
