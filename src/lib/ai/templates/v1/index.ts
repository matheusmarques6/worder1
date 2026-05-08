// =============================================
// Templates F1+F2 (shape canônico AgentTemplate). Coexistem com
// `src/lib/ai/templates/{joias,beleza,...}.ts` (NicheTemplate legado),
// mas estes aqui são os usados pelo wizard /ai/agents/new e pelo
// AgentRunner.
// =============================================

import type { AgentTemplate } from '../../types'
import { atendimentoGenericoTemplate } from './atendimento-generico'
import { recuperacaoGenericoTemplate } from './recuperacao-generico'
import { joalheriaTemplate } from './joalheria'
import { modaTemplate } from './moda'
import { belezaTemplate } from './beleza'
import { petTemplate } from './pet'
import { casaTemplate } from './casa'
import { fitnessTemplate } from './fitness'
import { babyTemplate } from './baby'
import { deliveryTemplate } from './delivery'

export const F1_TEMPLATES: AgentTemplate[] = [
  atendimentoGenericoTemplate,
  recuperacaoGenericoTemplate,
  joalheriaTemplate,
  modaTemplate,
  belezaTemplate,
  petTemplate,
  casaTemplate,
  fitnessTemplate,
  babyTemplate,
  deliveryTemplate,
]

export function getTemplateById(id: string): AgentTemplate | undefined {
  return F1_TEMPLATES.find((t) => t.id === id)
}

export {
  atendimentoGenericoTemplate,
  recuperacaoGenericoTemplate,
  joalheriaTemplate,
  modaTemplate,
  belezaTemplate,
  petTemplate,
  casaTemplate,
  fitnessTemplate,
  babyTemplate,
  deliveryTemplate,
}
