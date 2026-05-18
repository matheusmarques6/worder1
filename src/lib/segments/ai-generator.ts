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

import type { SupabaseClient } from '@supabase/supabase-js';
import { FIELD_CATALOG, CATEGORY_LABELS, OPERATORS_BY_TYPE, OPERATOR_LABELS } from './catalog';
import { validateSegmentRule } from './dsl';
import type { SegmentRule } from './dsl';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_RETRIES = 2;

// ─────────────────────────────────────────────────────────────────────
// Per-org custom event catalog
//
// The static FIELD_CATALOG only knows about Worder's built-in events
// (placed_order, viewed_product, etc.). Real stores fire dozens of
// custom events with their own property keys (e.g. a Shopify store
// firing `coupon_redeemed` with { code, discount_amount, plan_id }).
//
// To stop the AI from inventing field names, we sniff the org's
// actual contact_events table and pass a compact summary into the
// system prompt. Cached for 5 minutes per-org to avoid re-querying
// on every AI call.
// ─────────────────────────────────────────────────────────────────────

interface CustomEventCatalog {
  // event_type → list of property keys observed in the last 1k events
  events: Record<string, string[]>;
  generatedAt: number;
}

const CUSTOM_EVENT_CACHE_MS = 5 * 60 * 1000;
const customEventCache = new Map<string, CustomEventCatalog>();

export async function loadCustomEventCatalog(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CustomEventCatalog> {
  const cached = customEventCache.get(orgId);
  if (cached && Date.now() - cached.generatedAt < CUSTOM_EVENT_CACHE_MS) {
    return cached;
  }

  // Pull a recent slice of events. We don't need all rows — just the
  // distinct (event_type, property_key) tuples. 1k recent events
  // covers anything the merchant is realistically using right now.
  const { data } = await supabase
    .from('contact_events')
    .select('event_type, properties')
    .eq('organization_id', orgId)
    .order('occurred_at', { ascending: false })
    .limit(1000);

  const events: Record<string, Set<string>> = {};
  for (const row of (data || []) as Array<{ event_type: string; properties: any }>) {
    const set = events[row.event_type] || new Set<string>();
    if (row.properties && typeof row.properties === 'object') {
      for (const key of Object.keys(row.properties).slice(0, 30)) set.add(key);
    }
    events[row.event_type] = set;
  }

  const out: CustomEventCatalog = {
    events: Object.fromEntries(
      Object.entries(events).map(([k, v]) => [k, [...v].slice(0, 20)])
    ),
    generatedAt: Date.now(),
  };
  customEventCache.set(orgId, out);
  return out;
}

function buildCustomEventSection(catalog: CustomEventCatalog): string {
  const entries = Object.entries(catalog.events);
  if (entries.length === 0) return '';
  // Compact format: 'event_type: prop1, prop2, prop3'
  let out = '\n\nCustom events seen in this org (use these names verbatim; property sub-filters may target the listed paths or any nested key under them):';
  for (const [event, props] of entries) {
    out += `\n  - ${event}: ${props.join(', ') || '(no properties observed)'}`;
  }
  return out;
}

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
- event: { type:"event", event:"<event key>", frequency:{op:"at_least|at_most|exactly|between|zero", value:N, value2?:N}, window:{kind:"all_time"|"last"|"not_in_last"|"before"|"after"|"between_dates"|"between_relative"|"on_date", value?, unit?, date?, from?, to?}, property_filters?:[{path,type,operator,value,value2?}] }
- event_funnel: { type:"event_funnel", steps:[{event:"<key>", negate:false}, ...], window:{kind:"last", value:N, unit:"day"}, max_step_gap_days?:N } — strict-order sequence
- anniversary: { type:"anniversary", field:"<date field>", within_next_days:N } — recurring (month,day) match
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
10. "Aniversariantes da semana" / "aniversário próximo" → anniversary rule on field birthday with within_next_days=7.
11. "Viu produto → adicionou ao carrinho → não comprou" (ordered) → event_funnel with three steps in order: viewed_product, added_to_cart, placed_order with negate=true on the last step. Window typically last 30 days.
12. Date month/day pickers: "aniversariantes de Maio" / "born in May" → profile operator=month_in value=[5]. "Day 15 of any month" → operator=day_of_month_in value=[15]. Combine the two for specific date-of-month targeting. Always pass arrays.
13. Event period "on a specific date": "viewed page on 2026-04-13" → window kind=on_date, date='2026-04-13'.
14. Event property sub-filters support Omnisend-style array wildcards: 'raw.line_items.[].title' iterates each line item; chain wildcards for nested arrays like 'raw.fulfillments.[].line_items.[].title'. Use [] only when the JSON path crosses an array.
15. Condition budget: max 100 leaf conditions per segment. Compose with OR groups; avoid generating more.
16. Return ONLY the JSON via the create_segment tool. Never include explanation, markdown, or any text outside the tool call.`;

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

export interface GenerateOptions {
  // When provided, injects a per-org custom-event catalog into the
  // prompt. The AI then references actual fired event types + property
  // keys instead of guessing 'placed_order' for a store that named it
  // 'order_completed'.
  supabase?: SupabaseClient;
  orgId?: string;
}

export async function generateSegmentRule(
  userPrompt: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'AI não está configurada (ANTHROPIC_API_KEY ausente).', attempts: 0 };
  }

  // Per-org custom event sniffing — runs once, cached 5min in-process.
  let customSection = '';
  if (opts.supabase && opts.orgId) {
    try {
      const catalog = await loadCustomEventCatalog(opts.supabase, opts.orgId);
      customSection = buildCustomEventSection(catalog);
    } catch (err) {
      // Soft-fail: AI still works with the built-in catalog only.
      console.warn('[ai-generator] custom event catalog load failed:', err);
    }
  }

  // System prompt is the static catalog + optional per-org custom
  // event section. We keep the static portion cacheable (ephemeral)
  // so repeat requests don't re-pay the ~3k tokens of catalog. The
  // dynamic custom-event section is appended uncached because it
  // changes per-org and is small.
  const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (customSection) {
    systemBlocks.push({ type: 'text', text: customSection });
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
          system: systemBlocks,
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
