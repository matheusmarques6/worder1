// AI-powered segment rule generator.
//
// Takes a natural-language prompt ("clientes VIP que não compram há
// 60 dias") and returns a v2 SegmentRule. Uses Claude Haiku 4.5 with
// tool use to force structured output that matches the DSL exactly,
// then validates against our hand-rolled schema validator. Retries up
// to 2x if the output doesn't validate.
//
// The system prompt is static (field catalog + examples), so we mark
// it as ephemeral-cacheable to keep cost low across repeat requests
// from the same merchant session.

import { FIELD_CATALOG, CATEGORY_LABELS, OPERATORS_BY_TYPE, OPERATOR_LABELS } from './catalog';
import { validateSegmentRule } from './dsl';
import type { SegmentRule } from './dsl';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_RETRIES = 2;

export type GenerateResult =
  | { ok: true;  rule: SegmentRule; attempts: number }
  | { ok: false; error: string;    attempts: number };

// Build the field catalog summary the LLM uses to ground its output.
function buildCatalogPrompt(): string {
  const byCategory = new Map<string, string[]>();
  for (const f of FIELD_CATALOG) {
    const cat = CATEGORY_LABELS[f.category];
    const arr = byCategory.get(cat) || [];
    const ops = OPERATORS_BY_TYPE[f.type].map((o) => OPERATOR_LABELS[o] || o).slice(0, 4).join(', ');
    const enumStr = f.enumValues?.length ? ` [values: ${f.enumValues.map((e) => e.value).join('|')}]` : '';
    arr.push(`  - ${f.key} (${f.type}${enumStr}): ${f.label}. ops: ${ops}`);
    byCategory.set(cat, arr);
  }
  let out = '';
  for (const [cat, lines] of byCategory) {
    out += `\n${cat}:\n${lines.join('\n')}`;
  }
  return out;
}

const SYSTEM_PROMPT = `You translate natural-language audience descriptions into Worder segment rules.

Output schema (JSON):
{
  "version": 2,
  "root": {
    "type": "group",
    "logic": "AND" | "OR",
    "children": [Leaf | Group, ...]
  }
}

Leaf types:
- profile: { type:"profile", field:"<key from catalog>", operator:"<op>", value:..., value2?:..., unit?:"day|week|month" }
- event: { type:"event", event:"<event key>", frequency:{op:"at_least|at_most|exactly|between|zero", value:N, value2?:N}, window:{kind:"all_time"|"last"|"before"|"after"|"between_dates"|"between_relative", value?, unit?, date?, from?, to?}, property_filters?:[{path,type,operator,value,value2?}] }
- list_membership: { type:"list_membership", list_id:"<uuid>", is_member:true|false }
- consent: { type:"consent", channel:"email|sms|whatsapp|push", status:"can_receive|cannot_receive|subscribed|unsubscribed|pending" }

Available fields (catalog):${buildCatalogPrompt()}

Rules:
1. ONLY use field keys that appear in the catalog. Never invent fields.
2. For commerce events ("compraram", "abandonaram carrinho"), prefer EventRule over ProfileRule.
3. "Não compram há X dias" → event placed_order with frequency.op=zero and window kind=last value=X unit=day.
4. "Compraram pelo menos N vezes em X dias" → event placed_order with frequency.op=at_least value=N and window kind=last value=X unit=day.
5. "CLV alto" without explicit number → predicted_clv gte 500. "CLV baixo" → lte 100.
6. "Risco de churn alto" → churn_risk gte 0.7. "Baixo" → lte 0.3.
7. VIP → use lifecycle_stage enum equals "vip" OR rfm_segment in ["champions","loyal"]. Default to lifecycle_stage when ambiguous.
8. "Inscritos no email" → profile is_subscribed_email equals true (NOT a consent rule unless they explicitly say "pode receber email").
9. "Carrinho abandonado" → event added_to_cart with frequency at_least 1, window last(7-30 days), AND event placed_order with frequency zero same window. Combine with AND logic.
10. Return ONLY the JSON via the create_segment tool. Never include explanation, markdown, or any text outside the tool call.`;

const TOOL_DEF = {
  name: 'create_segment',
  description: 'Submit the final segment rule. Call this exactly once with the complete rule.',
  input_schema: {
    type: 'object' as const,
    required: ['version', 'root'],
    properties: {
      version: { type: 'integer', enum: [2] },
      root: { type: 'object' },
    },
  },
};

// Few-shot examples grounded in our catalog.
const FEW_SHOT_EXAMPLES = [
  {
    role: 'user' as const,
    content: 'Clientes VIP que não compram há 60 dias',
  },
  {
    role: 'assistant' as const,
    content: [{
      type: 'tool_use' as const,
      id: 'toolu_1',
      name: 'create_segment',
      input: {
        version: 2,
        root: {
          type: 'group',
          logic: 'AND',
          children: [
            { type: 'profile', field: 'lifecycle_stage', operator: 'equals', value: 'vip' },
            { type: 'event', event: 'placed_order', frequency: { op: 'zero', value: 0 }, window: { kind: 'last', value: 60, unit: 'day' } },
          ],
        },
      },
    }],
  },
  {
    role: 'user' as const,
    content: 'Carrinho abandonado nos últimos 7 dias com valor acima de R$200',
  },
  {
    role: 'assistant' as const,
    content: [{
      type: 'tool_use' as const,
      id: 'toolu_2',
      name: 'create_segment',
      input: {
        version: 2,
        root: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'event',
              event: 'added_to_cart',
              frequency: { op: 'at_least', value: 1 },
              window: { kind: 'last', value: 7, unit: 'day' },
              property_filters: [
                { path: 'price', type: 'number', operator: 'gte', value: 200 },
              ],
            },
            {
              type: 'event',
              event: 'placed_order',
              frequency: { op: 'zero', value: 0 },
              window: { kind: 'last', value: 7, unit: 'day' },
            },
          ],
        },
      },
    }],
  },
  {
    role: 'user' as const,
    content: 'Clientes com CLV alto e baixo risco de churn',
  },
  {
    role: 'assistant' as const,
    content: [{
      type: 'tool_use' as const,
      id: 'toolu_3',
      name: 'create_segment',
      input: {
        version: 2,
        root: {
          type: 'group',
          logic: 'AND',
          children: [
            { type: 'profile', field: 'predicted_clv', operator: 'gte', value: 500 },
            { type: 'profile', field: 'churn_risk', operator: 'lte', value: 0.3 },
          ],
        },
      },
    }],
  },
];

export async function generateSegmentRule(userPrompt: string): Promise<GenerateResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'AI não está configurada (ANTHROPIC_API_KEY ausente).', attempts: 0 };
  }

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: [
            {
              type: 'text',
              text: SYSTEM_PROMPT,
              // Cache the system prompt — it's static across requests and
              // saves ~3k tokens per call after the first.
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: [TOOL_DEF],
          tool_choice: { type: 'tool', name: 'create_segment' },
          messages: [
            ...FEW_SHOT_EXAMPLES,
            // Inject the validator feedback when retrying
            { role: 'user', content: attempt === 1 ? userPrompt : `${userPrompt}\n\n(Sua tentativa anterior falhou na validação: ${lastError}. Corrija e tente de novo.)` },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        lastError = `Anthropic ${res.status}: ${text.slice(0, 200)}`;
        continue;
      }

      const data = await res.json();
      // Find the tool_use block in the response
      const toolUse = (data.content || []).find((b: any) => b.type === 'tool_use');
      if (!toolUse?.input) {
        lastError = 'no tool_use block in response';
        continue;
      }

      const validation = validateSegmentRule(toolUse.input);
      if (validation.ok) {
        return { ok: true, rule: validation.rule, attempts: attempt };
      }
      lastError = validation.errors.join('; ');
    } catch (err: any) {
      lastError = err?.message || 'unknown error';
    }
  }

  return { ok: false, error: lastError || 'falhou após retries', attempts: MAX_RETRIES + 1 };
}
