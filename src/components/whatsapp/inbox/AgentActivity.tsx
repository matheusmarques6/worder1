'use client'

// =============================================
// AgentActivity — o que o agente esta fazendo, ao vivo.
//
// Problema que resolve: entre a mensagem do cliente e a resposta do bot passam
// vários segundos (debounce + transcricao + LLM + tool calls + delays
// humanizados) em que a tela ficava completamente muda. Quem atende nao sabia
// se o agente ia responder, estava travado, ou tinha desistido.
//
// Alimentado por whatsapp_ai_run_steps via Realtime (useCloudInboxRealtime).
// O painel some no passo terminal — a mensagem em si chega pelo canal normal
// de mensagens, entao manter o painel depois disso seria duplicar informacao.
// =============================================

import { useEffect, useState } from 'react'
import { Bot, Check, AlertCircle, UserPlus, Loader2 } from 'lucide-react'
import type { AgentRunStepEvent } from '@/hooks/useCloudInboxRealtime'
import { AI_RUN_STEP_LABELS, isTerminalAiRunStep } from '@/lib/ai/run-steps-shared'

// Rede de seguranca: um passo nao-terminal mais velho que isto e considerado
// abandonado e o painel desaparece. Nenhuma cobertura de `return` no runner
// resolve um worker que MORRE no meio (timeout de funcao, deploy, OOM) — sem
// este teto o inbox mostraria "Gerando resposta" para sempre.
// Folgado de proposito: debounce (8s) + LLM + tool loop + delays humanizados
// somam facil algumas dezenas de segundos.
const STALE_AFTER_MS = 120_000
const TICK_MS = 15_000

// Fonte unica com o runner (run-steps-shared.ts e puro — nao arrasta
// supabaseAdmin para o bundle do client).
export const isTerminalStep = isTerminalAiRunStep
const STEP_LABELS = AI_RUN_STEP_LABELS

export function AgentActivity({ steps }: { steps: AgentRunStepEvent[] }) {
  const last = steps.length > 0 ? steps[steps.length - 1] : null
  const terminal = last ? isTerminalStep(last.step) : false

  // Re-render periodico so enquanto ha run em andamento: sem isto o painel
  // preso nunca reavaliaria a idade do passo (nenhum evento novo chega).
  const [, setTick] = useState(0)
  const needsTick = Boolean(last) && !terminal
  useEffect(() => {
    if (!needsTick) return
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [needsTick, last?.id])

  if (!last) return null

  if (!terminal) {
    const age = Date.now() - new Date(last.created_at).getTime()
    // Number.isNaN protege contra created_at invalido: sem isto a comparacao
    // seria false e o painel ficaria preso, exatamente o que queremos evitar.
    if (Number.isNaN(age) || age > STALE_AFTER_MS) return null
  }

  // Terminal em 'sent' nao rende painel: a mensagem aparece na conversa e diz
  // tudo. Os outros terminais SIM — sao os casos em que nenhuma mensagem vai
  // aparecer, e sem isto o silencio volta a ser inexplicado.
  if (last.step === 'sent') return null

  const tone = terminal
    ? last.step === 'failed'
      ? { box: 'bg-red-50 border-red-200', text: 'text-red-700', icon: <AlertCircle className="w-3.5 h-3.5" /> }
      : last.step === 'transferred'
        ? { box: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: <UserPlus className="w-3.5 h-3.5" /> }
        : { box: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: <Check className="w-3.5 h-3.5" /> }
    : { box: 'bg-primary-50 border-primary-200', text: 'text-primary-700', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> }

  // Passos anteriores viram trilha, para o atendente entender o caminho (ex.:
  // "transcreveu o audio, consultou o pedido, entao respondeu").
  const trail = steps.slice(0, -1).slice(-4)

  return (
    <div className={`mx-4 mb-2 rounded-xl border px-3 py-2 ${tone.box}`}>
      <div className={`flex items-center gap-2 text-xs font-medium ${tone.text}`}>
        <Bot className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-shrink-0">{tone.icon}</span>
        <span className="truncate">{last.detail || STEP_LABELS[last.step] || last.step}</span>
      </div>

      {trail.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 pl-6">
          {trail.map((s) => (
            <span key={s.id} className="text-[10px] text-gray-400">
              {s.detail || STEP_LABELS[s.step] || s.step}
              <Check className="inline w-2.5 h-2.5 ml-0.5 -mt-px" />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
