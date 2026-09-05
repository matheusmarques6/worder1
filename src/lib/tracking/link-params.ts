// =============================================================
// Parâmetros de rastreamento em TODOS os links enviados.
//
// Modelo copiado de Omnisend/Klaviyo:
//   • UTM completo (source, medium, campaign, content, term, id) em cada
//     link, com valores montados por TEMPLATE com variáveis — o lojista
//     configura uma vez por loja e cada envio se rotula sozinho
//     (`campaign: Black Friday (id)`, `automation: Welcome (id)`…).
//   • Parâmetros de IDENTIFICAÇÃO fixos, que o pixel lê na loja para
//     amarrar o visitante ao contato/envio (o `_kx` da Klaviyo, o
//     `omnisendContactID`/`omnisendAttributionID` da Omnisend):
//     worderContactID, worderSendID, worderCampaignID,
//     worderAutomationID, worderMessageID. Nunca são removidos.
//
// Valores que o link já traz (uma UTM colocada à mão no editor) vencem —
// só preenchemos o que falta, como as duas concorrentes fazem.
//
// Este módulo é puro (sem banco) para poder rodar no cliente (preview da
// tela de configurações) e no servidor (render do e-mail, SMS, WhatsApp).
// =============================================================

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

export type UtmTemplates = Record<UtmKey, string>;

export interface UtmCustomParam {
  /** Nome do parâmetro na URL (ex.: `utm_store`). */
  key: string;
  /** Template para campanhas. */
  campaign: string;
  /** Template para automações. */
  automation: string;
}

export interface UtmSettings {
  /** Desligado = links saem só com os parâmetros de identificação. */
  enabled: boolean;
  campaign: UtmTemplates;
  automation: UtmTemplates;
  custom: UtmCustomParam[];
}

export type LinkChannel = 'email' | 'sms' | 'whatsapp';
export type LinkMessageType = 'campaign' | 'automation';

export interface LinkContext {
  channel: LinkChannel;
  messageType: LinkMessageType;
  campaignName?: string | null;
  campaignId?: string | null;
  automationName?: string | null;
  automationId?: string | null;
  /** Campanha: assunto. Automação: nome do nó ("Email 1"). */
  messageName?: string | null;
  /** Campanha: id da campanha (sufixo "-b" na variante B). Automação: id do nó. */
  messageId?: string | null;
  emailSubject?: string | null;
  abVariant?: string | null;
  sendId?: string | null;
  contactId?: string | null;
  storeName?: string | null;
  storeDomain?: string | null;
  sentAt?: Date | string | null;
  /** Merge tags soltas ({{first_name}}…) que também podem entrar num valor. */
  extra?: Record<string, string | number | null | undefined>;
}

export interface LinkInfo {
  url: string;
  /** Texto visível do link (ou alt da imagem). */
  text?: string;
  /** Posição do link na mensagem, a partir de 1. */
  index?: number;
}

export interface UtmVariable {
  key: string;
  label: string;
  description: string;
  example: string;
  scope: 'all' | 'campaign' | 'automation' | 'link';
}

/** Catálogo exibido no seletor de variáveis da tela de configurações. */
export const UTM_VARIABLES: UtmVariable[] = [
  { key: 'channel', label: 'Canal', description: 'email, sms ou whatsapp', example: 'email', scope: 'all' },
  { key: 'message_type', label: 'Tipo de mensagem', description: 'campaign ou automation', example: 'campaign', scope: 'all' },
  { key: 'campaign_name', label: 'Nome da campanha', description: 'Como aparece na lista de campanhas', example: 'Black Friday', scope: 'campaign' },
  { key: 'campaign_id', label: 'ID da campanha', description: 'Identificador único da campanha', example: '3f2a9c1e', scope: 'campaign' },
  { key: 'automation_name', label: 'Nome da automação', description: 'Nome do fluxo', example: 'Welcome Series', scope: 'automation' },
  { key: 'automation_id', label: 'ID da automação', description: 'Identificador único do fluxo', example: '4684f86a', scope: 'automation' },
  { key: 'message_name', label: 'Nome da mensagem', description: 'Campanha: assunto. Automação: nome do e-mail no fluxo', example: 'Email 1', scope: 'all' },
  { key: 'message_id', label: 'ID da mensagem', description: 'Campanha: id da campanha (+ variante). Automação: id do nó', example: '250a848e', scope: 'all' },
  { key: 'email_subject', label: 'Assunto do e-mail', description: 'Assunto renderizado', example: 'Sua oferta chegou', scope: 'all' },
  { key: 'ab_variant', label: 'Variante A/B', description: 'a ou b (vazio sem teste)', example: 'a', scope: 'campaign' },
  { key: 'send_date', label: 'Data do envio', description: 'AAAA-MM-DD', example: '2026-09-05', scope: 'all' },
  { key: 'store_name', label: 'Nome da loja', description: 'Loja do envio', example: 'Dr. Groot', scope: 'all' },
  { key: 'store_domain', label: 'Domínio da loja', description: 'Domínio público da loja', example: 'drgroot.com', scope: 'all' },
  { key: 'send_id', label: 'ID do envio', description: 'Único por destinatário (alta cardinalidade)', example: '9b1c…', scope: 'all' },
  { key: 'contact_id', label: 'ID do contato', description: 'Identificador do contato na Worder', example: 'c7d2…', scope: 'all' },
  { key: 'link_text', label: 'Texto do link', description: 'Texto do botão/link clicado (ou alt da imagem)', example: 'Comprar agora', scope: 'link' },
  { key: 'link_index', label: 'Posição do link', description: 'Ordem do link na mensagem (1, 2, 3…)', example: '1', scope: 'link' },
];

export const DEFAULT_UTM_SETTINGS: UtmSettings = {
  enabled: true,
  campaign: {
    utm_source: 'worder',
    utm_medium: '{{channel}}',
    utm_campaign: 'campaign: {{campaign_name}} ({{campaign_id}})',
    utm_content: '{{message_id}}',
    utm_term: '{{send_date}}',
    utm_id: '{{campaign_id}}',
  },
  automation: {
    utm_source: 'worder',
    utm_medium: '{{channel}}',
    utm_campaign: 'automation: {{automation_name}} ({{automation_id}})',
    utm_content: '{{message_name}} ({{message_id}})',
    utm_term: '{{send_date}}',
    utm_id: '{{automation_id}}',
  },
  custom: [],
};

/** Parâmetros de identificação — o pixel da loja lê estes nomes. */
export const IDENT_PARAM_KEYS = [
  'worderContactID',
  'worderSendID',
  'worderCampaignID',
  'worderAutomationID',
  'worderMessageID',
] as const;

export const MAX_UTM_VALUE_LENGTH = 250;
export const MAX_CUSTOM_PARAMS = 10;
const CUSTOM_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;

// -------------------------------------------------------------
// Normalização das configurações (o que vem do banco pode estar
// incompleto, vazio ou de uma versão antiga).
// -------------------------------------------------------------

function cleanTemplate(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.replace(/[\r\n\t]+/g, ' ').trim();
  return t.slice(0, MAX_UTM_VALUE_LENGTH);
}

function normalizeTemplates(raw: unknown, defaults: UtmTemplates): UtmTemplates {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as UtmTemplates;
  for (const key of UTM_KEYS) {
    // Chave ausente → padrão. Chave presente (mesmo vazia) → respeita o
    // lojista, que pode ter apagado um parâmetro de propósito.
    out[key] = key in src ? cleanTemplate(src[key], '') : defaults[key];
  }
  return out;
}

export function isValidCustomParamKey(key: unknown): key is string {
  if (typeof key !== 'string' || !CUSTOM_KEY_RE.test(key)) return false;
  const lower = key.toLowerCase();
  if ((UTM_KEYS as readonly string[]).includes(lower)) return false;
  if (lower.startsWith('worder')) return false;
  return true;
}

export function normalizeUtmSettings(raw: unknown): UtmSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const custom: UtmCustomParam[] = [];
  const seen = new Set<string>();
  if (Array.isArray(src.custom)) {
    for (const item of src.custom) {
      if (!item || typeof item !== 'object') continue;
      const key = String(item.key ?? '').trim();
      if (!isValidCustomParamKey(key) || seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      custom.push({
        key,
        campaign: cleanTemplate(item.campaign, ''),
        automation: cleanTemplate(item.automation, ''),
      });
      if (custom.length >= MAX_CUSTOM_PARAMS) break;
    }
  }
  return {
    enabled: src.enabled !== false,
    campaign: normalizeTemplates(src.campaign, DEFAULT_UTM_SETTINGS.campaign),
    automation: normalizeTemplates(src.automation, DEFAULT_UTM_SETTINGS.automation),
    custom,
  };
}

/**
 * Configuração legada da organização (página antiga gravava só
 * utm_source / utm_medium / utm_auto_add em organizations.email_settings).
 * Vira uma configuração completa com esses dois valores aplicados aos
 * dois tipos de mensagem.
 */
export function utmSettingsFromLegacy(emailSettings: Record<string, any> | null | undefined): UtmSettings | null {
  if (!emailSettings) return null;
  const hasLegacy =
    typeof emailSettings.utm_source === 'string' ||
    typeof emailSettings.utm_medium === 'string' ||
    typeof emailSettings.utm_auto_add === 'boolean';
  if (!hasLegacy) return null;
  const base = normalizeUtmSettings({});
  const source = cleanTemplate(emailSettings.utm_source, '') || base.campaign.utm_source;
  const medium = cleanTemplate(emailSettings.utm_medium, '') || base.campaign.utm_medium;
  base.campaign.utm_source = source;
  base.automation.utm_source = source;
  base.campaign.utm_medium = medium;
  base.automation.utm_medium = medium;
  if (emailSettings.utm_auto_add === false) base.enabled = false;
  return base;
}

// -------------------------------------------------------------
// Sobrescrita por mensagem (campanha ou nó de fluxo) — o "UTM tags" da
// etapa de configurações da campanha na Omnisend.
// -------------------------------------------------------------

export interface MessageUtmConfig {
  /** Esta mensagem sai sem UTM (a identificação continua). */
  disabled?: boolean;
  /** Só as chaves preenchidas substituem o padrão da loja. */
  overrides?: Partial<UtmTemplates>;
}

/** Normaliza o que vem do cliente/banco; devolve null quando não há nada a aplicar. */
export function normalizeMessageUtmConfig(raw: unknown): MessageUtmConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, any>;
  const out: MessageUtmConfig = {};
  if (src.disabled === true) out.disabled = true;
  const overridesSrc = src.overrides && typeof src.overrides === 'object' ? src.overrides : {};
  const overrides: Partial<UtmTemplates> = {};
  for (const key of UTM_KEYS) {
    const v = overridesSrc[key];
    if (typeof v !== 'string') continue;
    const clean = cleanTemplate(v, '');
    if (clean) overrides[key] = clean;
  }
  if (Object.keys(overrides).length > 0) out.overrides = overrides;
  return out.disabled || out.overrides ? out : null;
}

// -------------------------------------------------------------
// Resolução de variáveis
// -------------------------------------------------------------

function fmtDate(v: Date | string | null | undefined): string {
  const d = v ? new Date(v) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Todas as variáveis disponíveis para um envio (+ as do link). */
export function linkVariables(ctx: LinkContext, link?: LinkInfo): Record<string, string> {
  const isCampaign = ctx.messageType === 'campaign';
  const vars: Record<string, string> = {};
  // Merge tags soltas primeiro — as variáveis nativas sempre vencem.
  if (ctx.extra) {
    for (const [k, v] of Object.entries(ctx.extra)) {
      if (v === null || v === undefined || typeof v === 'object') continue;
      vars[k] = String(v);
    }
  }
  Object.assign(vars, {
    channel: ctx.channel,
    message_type: ctx.messageType,
    campaign_name: str(ctx.campaignName),
    campaign_id: str(ctx.campaignId),
    automation_name: str(ctx.automationName),
    automation_id: str(ctx.automationId),
    message_name: str(ctx.messageName) || (isCampaign ? str(ctx.emailSubject) : ''),
    message_id:
      str(ctx.messageId) ||
      (isCampaign ? str(ctx.campaignId) + (ctx.abVariant && ctx.abVariant !== 'a' ? `-${ctx.abVariant}` : '') : ''),
    email_subject: str(ctx.emailSubject),
    ab_variant: str(ctx.abVariant),
    send_date: fmtDate(ctx.sentAt),
    store_name: str(ctx.storeName),
    store_domain: str(ctx.storeDomain).replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
    send_id: str(ctx.sendId),
    contact_id: str(ctx.contactId),
    link_text: str(link?.text),
    link_index: link?.index ? String(link.index) : '',
  });
  return vars;
}

const TAG_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Resolve `{{variavel}}` (com `{{a|b}}` = primeira não vazia) num template.
 * Variável desconhecida → vazio, nunca `{{x}}` literal dentro de uma URL.
 */
export function resolveUtmTemplate(template: string, vars: Record<string, string>): string {
  if (!template) return '';
  const out = template.replace(TAG_RE, (_m, expr: string) => {
    const alternatives = expr.split('|').map((s) => s.trim()).filter(Boolean);
    for (const alt of alternatives) {
      // Um literal entre aspas serve de fallback fixo:
      // `{{campaign_name|"sem nome"}}`. `{{contact.first_name}}` também
      // casa com a chave achatada `contact_first_name` das merge tags.
      const literal = alt.match(/^["'](.*)["']$/)?.[1];
      if (literal !== undefined) return literal;
      const v = vars[alt] ?? vars[alt.replace(/\./g, '_')];
      if (v !== undefined && v !== '') return v;
    }
    return '';
  });
  return sanitizeValue(out);
}

/** Limpa o valor final: sem quebras de linha, espaços colapsados, ≤ 250 chars. */
export function sanitizeValue(v: string): string {
  return v
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*\)/g, '') // "(vazio)" quando a variável dentro dos parênteses não existe
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_UTM_VALUE_LENGTH);
}

// -------------------------------------------------------------
// Montagem dos parâmetros de um envio
// -------------------------------------------------------------

export interface BuildLinkParamsOptions {
  /** Sobrescritas por mensagem (nó do fluxo / campanha). Só as chaves presentes. */
  utmOverrides?: Partial<UtmTemplates> | null;
  /** Desliga as UTMs só nesta mensagem (identificação continua). */
  utmDisabled?: boolean;
}

export interface LinkParams {
  utm: Record<string, string>;
  ident: Record<string, string>;
}

export function identificationParams(ctx: LinkContext): Record<string, string> {
  const ident: Record<string, string> = {};
  if (ctx.contactId) ident.worderContactID = String(ctx.contactId);
  if (ctx.sendId) ident.worderSendID = String(ctx.sendId);
  if (ctx.messageType === 'campaign' && ctx.campaignId) ident.worderCampaignID = String(ctx.campaignId);
  if (ctx.messageType === 'automation' && ctx.automationId) ident.worderAutomationID = String(ctx.automationId);
  const messageId = ctx.messageId || (ctx.messageType === 'campaign' ? ctx.campaignId : null);
  if (messageId) ident.worderMessageID = String(messageId);
  return ident;
}

export function buildLinkParams(
  settings: UtmSettings,
  ctx: LinkContext,
  link?: LinkInfo,
  opts: BuildLinkParamsOptions = {}
): LinkParams {
  const ident = identificationParams(ctx);
  const utm: Record<string, string> = {};
  if (settings.enabled && !opts.utmDisabled) {
    const vars = linkVariables(ctx, link);
    const templates = ctx.messageType === 'campaign' ? settings.campaign : settings.automation;
    for (const key of UTM_KEYS) {
      const override = opts.utmOverrides?.[key];
      const template = typeof override === 'string' && override.trim() !== '' ? override : templates[key];
      const value = resolveUtmTemplate(template, vars);
      if (value) utm[key] = value;
    }
    for (const custom of settings.custom) {
      const template = ctx.messageType === 'campaign' ? custom.campaign : custom.automation;
      const value = resolveUtmTemplate(template, vars);
      if (value && !(custom.key in utm) && !(custom.key in ident)) utm[custom.key] = value;
    }
  }
  return { utm, ident };
}

// -------------------------------------------------------------
// Carimbo em URLs
// -------------------------------------------------------------

const SKIP_SCHEMES = /^(mailto:|tel:|sms:|javascript:|data:|#)/i;
const SKIP_PATHS = ['/unsubscribe', '/preferences', '/t/c/', '/t/o/', '/api/t/', '/api/unsubscribe'];

export interface StampOptions {
  /** Hosts que nunca recebem parâmetros (domínio de tracking, app). */
  skipHosts?: string[];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Uma URL que pode receber parâmetros? (http(s), resolvida, fora do app). */
export function isStampableUrl(url: string, opts: StampOptions = {}): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (SKIP_SCHEMES.test(trimmed)) return false;
  if (/\{\{|\}\}/.test(trimmed)) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const host = hostOf(trimmed);
  if (!host) return false;
  if (opts.skipHosts?.some((h) => h && host === h.toLowerCase())) return false;
  const lower = trimmed.toLowerCase();
  if (SKIP_PATHS.some((p) => lower.includes(p))) return false;
  return true;
}

/**
 * Acrescenta parâmetros à URL sem sobrescrever os que já existem e
 * preservando o fragmento (#). URL inválida volta intacta.
 */
export function appendParamsToUrl(url: string, params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return url;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return url;
  }
  const sp = target.searchParams;
  let changed = false;
  for (const [k, v] of entries) {
    if (sp.has(k)) continue;
    sp.set(k, v);
    changed = true;
  }
  if (!changed) return url;
  target.search = sp.toString();
  return target.toString();
}

export type LinkParamsResolver = (link: LinkInfo) => Record<string, string>;

function decodeAttr(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function encodeAttr(url: string): string {
  return url.replace(/&/g, '&amp;');
}

function anchorText(inner: string): string {
  const alt = inner.match(/<img[^>]*\balt=["']([^"']*)["']/i)?.[1] || '';
  const text = inner
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || alt).slice(0, 120);
}

/**
 * Carimba todo `<a href>` do HTML. `resolve` recebe o link (url, texto,
 * posição) e devolve os parâmetros — assim `{{link_text}}` e
 * `{{link_index}}` funcionam. Idempotente: parâmetros já presentes não
 * são tocados.
 */
export function stampHtmlLinks(html: string, resolve: LinkParamsResolver, opts: StampOptions = {}): string {
  let index = 0;
  const stampOne = (rawUrl: string, inner: string | null): string | null => {
    const decoded = decodeAttr(rawUrl);
    if (!isStampableUrl(decoded, opts)) return null;
    index += 1;
    const params = resolve({ url: decoded, text: inner === null ? undefined : anchorText(inner), index });
    const stamped = appendParamsToUrl(decoded, params);
    return encodeAttr(stamped);
  };

  // Passo 1: âncoras completas (temos o texto do link).
  let out = html.replace(
    /(<a\b[^>]*?\bhref=["'])([^"']+)(["'][^>]*>)([\s\S]*?)(<\/a>)/gi,
    (match, prefix: string, url: string, suffix: string, inner: string, close: string) => {
      const stamped = stampOne(url, inner);
      return stamped === null ? match : `${prefix}${stamped}${suffix}${inner}${close}`;
    }
  );

  // Passo 2: âncoras sem fechamento (HTML malformado) — sem texto, mas
  // com todos os parâmetros. As já carimbadas no passo 1 saem iguais.
  out = out.replace(/(<a\b[^>]*?\bhref=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix: string, url: string, suffix: string) => {
    const decoded = decodeAttr(url);
    if (!isStampableUrl(decoded, opts)) return match;
    const already = /[?&]worderSendID=|[?&]utm_source=/.test(decoded);
    if (already) {
      // Só preenche o que falta (ex.: link com utm manual sem identificação).
      const params = resolve({ url: decoded, index: index + 1 });
      const stamped = appendParamsToUrl(decoded, params);
      return stamped === decoded ? match : `${prefix}${encodeAttr(stamped)}${suffix}`;
    }
    const stamped = stampOne(url, null);
    return stamped === null ? match : `${prefix}${stamped}${suffix}`;
  });

  return out;
}

const TEXT_URL_RE = /https?:\/\/[^\s<>"'“”‘’]+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>»"']+$/;

/**
 * Carimba URLs soltas num texto (SMS / WhatsApp). Pontuação final
 * ("veja: https://loja.com/x.") fica fora da URL.
 */
export function stampTextLinks(text: string, resolve: LinkParamsResolver, opts: StampOptions = {}): string {
  if (!text) return text;
  let index = 0;
  return text.replace(TEXT_URL_RE, (match: string) => {
    const trailing = match.match(TRAILING_PUNCT_RE)?.[0] || '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    if (!isStampableUrl(url, opts)) return match;
    index += 1;
    const params = resolve({ url, index });
    return appendParamsToUrl(url, params) + trailing;
  });
}

/** Atalho: resolver fixo para um envio (settings + contexto + overrides). */
export function makeLinkParamsResolver(
  settings: UtmSettings,
  ctx: LinkContext,
  opts: BuildLinkParamsOptions = {}
): LinkParamsResolver {
  return (link) => {
    const { utm, ident } = buildLinkParams(settings, ctx, link, opts);
    return { ...utm, ...ident };
  };
}

/** Exemplo de URL para a tela de configurações. */
export function previewLinkUrl(
  settings: UtmSettings,
  ctx: LinkContext,
  destination = 'https://sualoja.com.br/products/exemplo'
): string {
  const resolve = makeLinkParamsResolver(settings, ctx);
  return appendParamsToUrl(destination, resolve({ url: destination, text: 'Comprar agora', index: 1 }));
}

/** Contexto de exemplo usado no preview. */
export function sampleLinkContext(messageType: LinkMessageType, channel: LinkChannel = 'email'): LinkContext {
  return messageType === 'campaign'
    ? {
        channel,
        messageType,
        campaignName: 'Black Friday',
        campaignId: '3f2a9c1e-0000-4000-8000-000000000001',
        emailSubject: 'Até 50% OFF só hoje',
        abVariant: '',
        sendId: '9b1c7d3e-0000-4000-8000-000000000002',
        contactId: 'c7d2a1b4-0000-4000-8000-000000000003',
        storeName: 'Sua Loja',
        storeDomain: 'sualoja.com.br',
      }
    : {
        channel,
        messageType,
        automationName: 'Welcome Series',
        automationId: '4684f86a-0000-4000-8000-000000000004',
        messageName: 'Email 1',
        messageId: '250a848e-0000-4000-8000-000000000005',
        emailSubject: 'Bem-vindo(a)!',
        sendId: '9b1c7d3e-0000-4000-8000-000000000002',
        contactId: 'c7d2a1b4-0000-4000-8000-000000000003',
        storeName: 'Sua Loja',
        storeDomain: 'sualoja.com.br',
      };
}
