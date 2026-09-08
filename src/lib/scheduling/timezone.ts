// =============================================================
// Fuso horário do destinatário — núcleo de agendamento
//
// Tudo que decide "a que horas isso sai" passa por aqui. Antes cada
// ponto do sistema fazia sua própria conta com Date#getHours() e
// Date#setHours(), que leem o relógio do SERVIDOR — e o servidor da
// Vercel roda em UTC. Na prática "enviar só entre 09:00 e 21:00"
// virava 06:00 às 18:00 no Brasil, sem ninguém perceber.
//
// As duas funções que importam:
//
//   partsInTz(tz, date)      — que horas são, em parede, naquele fuso
//   zonedTimeToUtc(tz, wall) — o instante UTC de um horário de parede
//
// A segunda faz duas passadas de propósito. O deslocamento de um fuso
// depende do próprio instante (horário de verão), então a primeira
// estimativa pode cair do lado errado da virada; a segunda corrige.
// Isso também é o que faz meias-horas funcionarem (Índia +5:30,
// Terra Nova -3:30), que a conta antiga por delta de HORA errava.
// =============================================================

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const DEFAULT_TZ = 'America/Sao_Paulo';

/** Um fuso IANA que o runtime realmente conhece? */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Horário de parede naquele fuso. `weekday` segue a convenção do JS
 * (0 = domingo) — quem precisa de 0 = segunda converte na borda.
 */
export function partsInTz(
  tz: string,
  date: Date = new Date()
): WallClock & { second: number; weekday: number } {
  const safeTz = isValidTimezone(tz) ? tz : DEFAULT_TZ;
  const parts = formatter(safeTz).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  // Intl devolve "24" à meia-noite em algumas versões do ICU; normaliza.
  const hour = parseInt(get('hour'), 10) % 24;
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    weekday: WEEKDAY_INDEX[parts.find((p) => p.type === 'weekday')?.value || 'Sun'] ?? 0,
  };
}

/** Deslocamento do fuso, em ms, NAQUELE instante (respeita horário de verão). */
function offsetMsAt(tz: string, date: Date): number {
  const p = partsInTz(tz, date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Zera os milissegundos dos dois lados: partsInTz não os devolve.
  return asUtc - (date.getTime() - (date.getTime() % 1000));
}

/**
 * O instante UTC em que o relógio daquele fuso marca `wall`.
 *
 * Duas passadas: a primeira estima o deslocamento usando o palpite
 * ingênuo, a segunda recalcula já perto do instante certo. É o que
 * mantém a conta correta na virada do horário de verão e em fusos de
 * meia hora.
 *
 * Nas duas horas ambíguas de outono a função devolve a primeira
 * ocorrência; na hora inexistente da primavera, o instante logo após
 * o salto. Nenhum dos dois casos justifica adiar um envio.
 */
export function zonedTimeToUtc(tz: string, wall: WallClock): Date {
  const safeTz = isValidTimezone(tz) ? tz : DEFAULT_TZ;
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  let ts = naive - offsetMsAt(safeTz, new Date(naive));
  ts = naive - offsetMsAt(safeTz, new Date(ts));
  return new Date(ts);
}

/**
 * Próxima vez que o relógio de `tz` marcar hour:minute, a partir de
 * `from` (exclusivo). Usado tanto pela campanha "no fuso do
 * destinatário" quanto pela janela de horário do delay.
 */
export function nextOccurrenceInTz(
  tz: string,
  hour: number,
  minute: number = 0,
  from: Date = new Date()
): Date {
  const p = partsInTz(tz, from);
  const hoje = zonedTimeToUtc(tz, {
    year: p.year, month: p.month, day: p.day, hour, minute,
  });
  if (hoje.getTime() > from.getTime()) return hoje;
  // Amanhã no calendário DAQUELE fuso — somar 24h em UTC erra no dia
  // em que o horário de verão muda.
  const amanha = new Date(hoje.getTime() + 36 * 3600_000);
  const pa = partsInTz(tz, amanha);
  return zonedTimeToUtc(tz, {
    year: pa.year, month: pa.month, day: pa.day, hour, minute,
  });
}

/**
 * Empurra `date` para dentro da janela [fromHHMM, toHHMM] do fuso, e
 * para um dos dias permitidos. Devolve a própria data quando ela já
 * está válida.
 *
 * `allowedWeekdays` usa a convenção do JS (0 = domingo). Lista vazia
 * ou ausente significa "todo dia".
 */
export function clampToSendWindow(
  date: Date,
  tz: string,
  opts: {
    fromHour?: number; fromMinute?: number;
    toHour?: number; toMinute?: number;
    allowedWeekdays?: number[];
  }
): Date {
  const { fromHour, fromMinute = 0, toHour, toMinute = 0, allowedWeekdays } = opts;
  let out = date;

  const temJanela = Number.isInteger(fromHour) && Number.isInteger(toHour);
  if (temJanela) {
    const p = partsInTz(tz, out);
    const agora = p.hour * 60 + p.minute;
    const inicio = (fromHour as number) * 60 + fromMinute;
    const fim = (toHour as number) * 60 + toMinute;
    // Janela que atravessa a meia-noite (ex.: 22:00 → 06:00) é
    // "fora" só no miolo do dia.
    const dentro = inicio <= fim
      ? agora >= inicio && agora <= fim
      : agora >= inicio || agora <= fim;
    if (!dentro) out = nextOccurrenceInTz(tz, fromHour as number, fromMinute, out);
  }

  if (allowedWeekdays && allowedWeekdays.length > 0 && allowedWeekdays.length < 7) {
    // No máximo 7 saltos: um deles cai num dia permitido por
    // construção, já que a lista não é vazia.
    for (let i = 0; i < 7; i++) {
      const atual = partsInTz(tz, out);
      if (allowedWeekdays.includes(atual.weekday)) break;
      // 36h garante que o calendário do fuso vire de dia mesmo na
      // madrugada em que o relógio recua uma hora.
      const pd = partsInTz(tz, new Date(out.getTime() + 36 * 3600_000));
      out = zonedTimeToUtc(tz, {
        year: pd.year, month: pd.month, day: pd.day,
        // Ao pular de dia, reabre no início da janela — senão um delay
        // que caiu 23h de sábado reabriria 23h de segunda.
        hour: temJanela ? (fromHour as number) : atual.hour,
        minute: temJanela ? fromMinute : atual.minute,
      });
    }
  }

  return out;
}

// -------------------------------------------------------------
// De onde sai o fuso de um contato
// -------------------------------------------------------------

/**
 * País (ISO-2 ou nome) → fuso IANA. Para países de fuso único o mapa é
 * exato; para os que têm vários (EUA, Brasil, Canadá, Austrália,
 * Rússia, México, Indonésia) usamos o fuso mais populoso — é o mesmo
 * palpite que a concorrência faz quando não tem o dado do navegador,
 * e ele só entra quando o navegador não informou nada.
 */
const COUNTRY_TZ: Record<string, string> = {
  BR: 'America/Sao_Paulo', PT: 'Europe/Lisbon', US: 'America/New_York',
  CA: 'America/Toronto', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima',
  UY: 'America/Montevideo', PY: 'America/Asuncion', BO: 'America/La_Paz',
  EC: 'America/Guayaquil', VE: 'America/Caracas', CR: 'America/Costa_Rica',
  PA: 'America/Panama', GT: 'America/Guatemala', DO: 'America/Santo_Domingo',
  CU: 'America/Havana', PR: 'America/Puerto_Rico',
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris',
  ES: 'Europe/Madrid', IT: 'Europe/Rome', DE: 'Europe/Berlin',
  NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', CH: 'Europe/Zurich',
  AT: 'Europe/Vienna', SE: 'Europe/Stockholm', NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki', PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague', GR: 'Europe/Athens', RO: 'Europe/Bucharest',
  HU: 'Europe/Budapest', BG: 'Europe/Sofia', HR: 'Europe/Zagreb',
  RS: 'Europe/Belgrade', UA: 'Europe/Kyiv', RU: 'Europe/Moscow',
  TR: 'Europe/Istanbul', IS: 'Atlantic/Reykjavik', LU: 'Europe/Luxembourg',
  AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
  JP: 'Asia/Tokyo', CN: 'Asia/Shanghai', KR: 'Asia/Seoul',
  IN: 'Asia/Kolkata', ID: 'Asia/Jakarta', TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh', PH: 'Asia/Manila', MY: 'Asia/Kuala_Lumpur',
  SG: 'Asia/Singapore', HK: 'Asia/Hong_Kong', TW: 'Asia/Taipei',
  PK: 'Asia/Karachi', BD: 'Asia/Dhaka', LK: 'Asia/Colombo',
  AE: 'Asia/Dubai', SA: 'Asia/Riyadh', IL: 'Asia/Jerusalem',
  QA: 'Asia/Qatar', KW: 'Asia/Kuwait', JO: 'Asia/Amman',
  ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos', KE: 'Africa/Nairobi',
  EG: 'Africa/Cairo', MA: 'Africa/Casablanca', GH: 'Africa/Accra',
  AO: 'Africa/Luanda', MZ: 'Africa/Maputo', TZ: 'Africa/Dar_es_Salaam',
};

/** Nomes por extenso que o Shopify manda no endereço. */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  brazil: 'BR', brasil: 'BR', portugal: 'PT',
  'united states': 'US', usa: 'US', 'united states of america': 'US',
  canada: 'CA', mexico: 'MX', méxico: 'MX', argentina: 'AR', chile: 'CL',
  colombia: 'CO', peru: 'PE', perú: 'PE', uruguay: 'UY', paraguay: 'PY',
  'united kingdom': 'GB', england: 'GB', ireland: 'IE', france: 'FR',
  spain: 'ES', españa: 'ES', italy: 'IT', italia: 'IT', germany: 'DE',
  deutschland: 'DE', netherlands: 'NL', belgium: 'BE', switzerland: 'CH',
  austria: 'AT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI',
  poland: 'PL', greece: 'GR', romania: 'RO', turkey: 'TR', russia: 'RU',
  australia: 'AU', 'new zealand': 'NZ', japan: 'JP', china: 'CN',
  'south korea': 'KR', india: 'IN', indonesia: 'ID', thailand: 'TH',
  vietnam: 'VN', philippines: 'PH', malaysia: 'MY', singapore: 'SG',
  'hong kong': 'HK', taiwan: 'TW', pakistan: 'PK', bangladesh: 'BD',
  'united arab emirates': 'AE', 'saudi arabia': 'SA', israel: 'IL',
  'south africa': 'ZA', nigeria: 'NG', kenya: 'KE', egypt: 'EG',
  morocco: 'MA', angola: 'AO', mozambique: 'MZ',
};

/** Fuso a partir do país, quando o navegador não informou nada. */
export function timezoneFromCountry(country: string | null | undefined): string | null {
  if (!country || typeof country !== 'string') return null;
  const bruto = country.trim();
  if (!bruto) return null;
  const iso = bruto.length === 2
    ? bruto.toUpperCase()
    : COUNTRY_NAME_TO_ISO[bruto.toLowerCase()];
  if (!iso) return null;
  return COUNTRY_TZ[iso] || null;
}

export interface TimezoneSources {
  /** contacts.timezone — o mais confiável: veio do navegador do próprio contato. */
  contactTimezone?: string | null;
  /** contacts.country — palpite por país. */
  contactCountry?: string | null;
  /** shopify_stores.timezone — o fuso da loja. */
  storeTimezone?: string | null;
  /** organizations.quiet_hours_timezone — última rede antes do padrão. */
  orgTimezone?: string | null;
}

export interface ResolvedTimezone {
  timezone: string;
  /** De onde veio — a UI mostra isso, e o relatório separa "sabido" de "chutado". */
  source: 'contact' | 'country' | 'store' | 'organization' | 'default';
}

/**
 * Cascata de fuso do destinatário. Nunca devolve vazio: sem nenhuma
 * pista, cai no fuso da loja e, no limite, em America/Sao_Paulo — um
 * envio no horário errado é ruim, um envio que nunca sai é pior.
 */
export function resolveRecipientTimezone(src: TimezoneSources): ResolvedTimezone {
  if (isValidTimezone(src.contactTimezone)) {
    return { timezone: src.contactTimezone as string, source: 'contact' };
  }
  const porPais = timezoneFromCountry(src.contactCountry);
  if (porPais) return { timezone: porPais, source: 'country' };
  if (isValidTimezone(src.storeTimezone)) {
    return { timezone: src.storeTimezone as string, source: 'store' };
  }
  if (isValidTimezone(src.orgTimezone)) {
    return { timezone: src.orgTimezone as string, source: 'organization' };
  }
  return { timezone: DEFAULT_TZ, source: 'default' };
}

/**
 * Normaliza o que o navegador mandou. O pixel envia
 * Intl.DateTimeFormat().resolvedOptions().timeZone, que já é IANA —
 * mas o campo chega de fora, então nada entra no banco sem validar.
 */
export function normalizeTimezoneInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const tz = raw.trim();
  // 64 é folgado para qualquer nome IANA real e corta payload abusivo.
  if (!tz || tz.length > 64) return null;
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(tz)) return null;
  // UTC e GMT são válidos mas não dizem nada sobre o contato: alguns
  // navegadores em modo privado devolvem isso para todo mundo.
  if (tz === 'UTC' || tz === 'GMT' || tz === 'Etc/UTC' || tz === 'Etc/GMT') return null;
  return isValidTimezone(tz) ? tz : null;
}

export { DEFAULT_TZ };
