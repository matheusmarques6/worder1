// =============================================
// Templates F1 (shape canônico AgentTemplate). Coexistem com
// `src/lib/ai/templates/{joias,beleza,...}.ts` (NicheTemplate legado),
// mas estes aqui são os usados pelo wizard /ai/agents/new e pelo
// AgentRunner.
// =============================================

import type { AgentTemplate } from '../../types'
import { atendimentoGenericoTemplate } from './atendimento-generico'
import { recuperacaoGenericoTemplate } from './recuperacao-generico'
import { joalheriaTemplate } from './joalheria'

export const F1_TEMPLATES: AgentTemplate[] = [
  atendimentoGenericoTemplate,
  recuperacaoGenericoTemplate,
  joalheriaTemplate,
]

export function getTemplateById(id: string): AgentTemplate | undefined {
  return F1_TEMPLATES.find((t) => t.id === id)
}

export {
  atendimentoGenericoTemplate,
  recuperacaoGenericoTemplate,
  joalheriaTemplate,
}
