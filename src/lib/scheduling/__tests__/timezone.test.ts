// =============================================================
// O núcleo de fuso horário. Se estas contas erram, campanha e delay
// saem na hora errada — e ninguém percebe, porque o erro é constante.
//
// Os casos difíceis, e por que estão aqui:
//   • horário de verão: o deslocamento muda DENTRO do dia;
//   • fusos de meia hora (Índia +5:30): a conta por delta de hora,
//     que o código antigo fazia, erra 30 minutos sempre;
//   • janela que atravessa a meia-noite;
//   • virada de dia calculada no calendário DO FUSO, não em +24h UTC.
// =============================================================

import { describe, it, expect } from 'vitest';
import {
  partsInTz,
  zonedTimeToUtc,
  nextOccurrenceInTz,
  clampToSendWindow,
  timezoneFromCountry,
  resolveRecipientTimezone,
  normalizeTimezoneInput,
  isValidTimezone,
} from '../timezone';

describe('partsInTz', () => {
  it('lê o relógio de parede do fuso, não o do servidor', () => {
    // 2026-01-15T12:00Z → 09:00 em São Paulo (UTC-3, sem verão).
    const p = partsInTz('America/Sao_Paulo', new Date('2026-01-15T12:00:00Z'));
    expect(p.hour).toBe(9);
    expect(p.day).toBe(15);
  });

  it('atravessa a meia-noite para o dia anterior', () => {
    // 01:00Z de 16/01 ainda é 22:00 de 15/01 em São Paulo.
    const p = partsInTz('America/Sao_Paulo', new Date('2026-01-16T01:00:00Z'));
    expect(p.hour).toBe(22);
    expect(p.day).toBe(15);
  });

  it('resolve meia-noite como 0, nunca 24', () => {
    const p = partsInTz('America/Sao_Paulo', new Date('2026-01-16T03:00:00Z'));
    expect(p.hour).toBe(0);
  });

  it('devolve o dia da semana na convenção do JS', () => {
    // 2026-01-15 é uma quinta-feira.
    expect(partsInTz('UTC', new Date('2026-01-15T12:00:00Z')).weekday).toBe(4);
  });

  it('fuso inválido não explode — cai no padrão', () => {
    expect(() => partsInTz('Nao/Existe', new Date())).not.toThrow();
  });
});

describe('zonedTimeToUtc', () => {
  it('converte horário de parede em instante UTC', () => {
    const d = zonedTimeToUtc('America/Sao_Paulo', {
      year: 2026, month: 1, day: 15, hour: 9, minute: 0,
    });
    expect(d.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('acerta fuso de meia hora (a conta por delta de hora errava 30min)', () => {
    // Índia é UTC+5:30 o ano inteiro.
    const d = zonedTimeToUtc('Asia/Kolkata', {
      year: 2026, month: 6, day: 10, hour: 10, minute: 0,
    });
    expect(d.toISOString()).toBe('2026-06-10T04:30:00.000Z');
  });

  it('respeita o horário de verão do hemisfério norte', () => {
    // Nova York em julho é UTC-4 (verão); em janeiro, UTC-5.
    const verao = zonedTimeToUtc('America/New_York', {
      year: 2026, month: 7, day: 10, hour: 9, minute: 0,
    });
    const inverno = zonedTimeToUtc('America/New_York', {
      year: 2026, month: 1, day: 10, hour: 9, minute: 0,
    });
    expect(verao.toISOString()).toBe('2026-07-10T13:00:00.000Z');
    expect(inverno.toISOString()).toBe('2026-01-10T14:00:00.000Z');
  });

  it('ida e volta fecha em qualquer fuso', () => {
    for (const tz of ['America/Sao_Paulo', 'Asia/Kolkata', 'Europe/London', 'Australia/Sydney']) {
      const alvo = { year: 2026, month: 9, day: 4, hour: 14, minute: 30 };
      const p = partsInTz(tz, zonedTimeToUtc(tz, alvo));
      expect({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute })
        .toEqual(alvo);
    }
  });
});

describe('nextOccurrenceInTz', () => {
  it('escolhe hoje quando o horário ainda não passou', () => {
    // 10:00Z = 07:00 em SP; as 09:00 locais ainda estão por vir.
    const r = nextOccurrenceInTz('America/Sao_Paulo', 9, 0, new Date('2026-01-15T10:00:00Z'));
    expect(r.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('pula para amanhã quando o horário já passou', () => {
    // 15:00Z = 12:00 em SP; as 09:00 de hoje já foram.
    const r = nextOccurrenceInTz('America/Sao_Paulo', 9, 0, new Date('2026-01-15T15:00:00Z'));
    expect(r.toISOString()).toBe('2026-01-16T12:00:00.000Z');
  });

  it('o resultado marca exatamente a hora pedida no fuso', () => {
    for (const tz of ['Asia/Kolkata', 'Pacific/Auckland', 'America/New_York']) {
      const p = partsInTz(tz, nextOccurrenceInTz(tz, 10, 0, new Date('2026-03-20T00:00:00Z')));
      expect(p.hour).toBe(10);
      expect(p.minute).toBe(0);
    }
  });

  it('vira o dia pelo calendário do fuso, não somando 24h em UTC', () => {
    // Domingo 01/11/2026 é a virada do horário de verão em Nova York:
    // o dia local tem 25 horas. Somar 24h em UTC cairia na hora errada.
    const r = nextOccurrenceInTz('America/New_York', 9, 0, new Date('2026-11-01T16:00:00Z'));
    expect(partsInTz('America/New_York', r).hour).toBe(9);
  });
});

describe('clampToSendWindow', () => {
  const tz = 'America/Sao_Paulo';

  it('deixa passar o que já está dentro da janela', () => {
    // 15:00Z = 12:00 em SP, dentro de 09:00–21:00.
    const d = new Date('2026-01-15T15:00:00Z');
    expect(clampToSendWindow(d, tz, { fromHour: 9, toHour: 21 }).getTime()).toBe(d.getTime());
  });

  it('empurra a madrugada para a abertura da janela', () => {
    // 06:00Z = 03:00 em SP → deve virar 09:00 em SP (12:00Z).
    const r = clampToSendWindow(new Date('2026-01-15T06:00:00Z'), tz, { fromHour: 9, toHour: 21 });
    expect(r.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('depois do fechamento cai na abertura do dia seguinte', () => {
    // 02:00Z de 16/01 = 23:00 de 15/01 em SP, fora de 09–21.
    const r = clampToSendWindow(new Date('2026-01-16T02:00:00Z'), tz, { fromHour: 9, toHour: 21 });
    expect(partsInTz(tz, r).hour).toBe(9);
    expect(partsInTz(tz, r).day).toBe(16);
  });

  it('janela que atravessa a meia-noite considera a madrugada dentro', () => {
    // 03:00 local com janela 22:00→06:00 está DENTRO.
    const d = new Date('2026-01-15T06:00:00Z'); // 03:00 em SP
    expect(clampToSendWindow(d, tz, { fromHour: 22, toHour: 6 }).getTime()).toBe(d.getTime());
  });

  it('respeita os dias permitidos', () => {
    // 2026-01-17 é sábado (weekday 6). Permitindo só dias úteis (1-5),
    // tem de cair na segunda.
    const r = clampToSendWindow(new Date('2026-01-17T15:00:00Z'), tz, {
      fromHour: 9, toHour: 21, allowedWeekdays: [1, 2, 3, 4, 5],
    });
    const p = partsInTz(tz, r);
    expect(p.weekday).toBe(1);
    expect(p.hour).toBe(9);
  });

  it('lista de dias vazia não restringe nada', () => {
    const d = new Date('2026-01-17T15:00:00Z');
    expect(clampToSendWindow(d, tz, { allowedWeekdays: [] }).getTime()).toBe(d.getTime());
  });

  it('sem janela nem dias, devolve a data intacta', () => {
    const d = new Date('2026-01-15T06:00:00Z');
    expect(clampToSendWindow(d, tz, {}).getTime()).toBe(d.getTime());
  });
});

describe('origem do fuso do contato', () => {
  it('mapeia país por ISO-2 e por nome', () => {
    expect(timezoneFromCountry('BR')).toBe('America/Sao_Paulo');
    expect(timezoneFromCountry('br')).toBe('America/Sao_Paulo');
    expect(timezoneFromCountry('United States')).toBe('America/New_York');
    expect(timezoneFromCountry('Brasil')).toBe('America/Sao_Paulo');
    expect(timezoneFromCountry('Atlantida')).toBeNull();
    expect(timezoneFromCountry(null)).toBeNull();
  });

  it('a cascata prefere o dado do próprio contato', () => {
    const r = resolveRecipientTimezone({
      contactTimezone: 'Europe/Lisbon', contactCountry: 'BR',
      storeTimezone: 'America/New_York',
    });
    expect(r).toEqual({ timezone: 'Europe/Lisbon', source: 'contact' });
  });

  it('sem fuso do contato, usa o país', () => {
    const r = resolveRecipientTimezone({ contactCountry: 'PT', storeTimezone: 'America/New_York' });
    expect(r).toEqual({ timezone: 'Europe/Lisbon', source: 'country' });
  });

  it('sem país, usa a loja e depois a organização', () => {
    expect(resolveRecipientTimezone({ storeTimezone: 'Asia/Tokyo' }).source).toBe('store');
    expect(resolveRecipientTimezone({ orgTimezone: 'Asia/Tokyo' }).source).toBe('organization');
  });

  it('nunca devolve vazio', () => {
    const r = resolveRecipientTimezone({});
    expect(isValidTimezone(r.timezone)).toBe(true);
    expect(r.source).toBe('default');
  });

  it('fuso inválido guardado no contato não contamina a cascata', () => {
    const r = resolveRecipientTimezone({ contactTimezone: 'Marte/Olympus', contactCountry: 'BR' });
    expect(r).toEqual({ timezone: 'America/Sao_Paulo', source: 'country' });
  });
});

describe('normalizeTimezoneInput', () => {
  it('aceita fuso IANA de verdade', () => {
    expect(normalizeTimezoneInput('America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(normalizeTimezoneInput('  Europe/Lisbon  ')).toBe('Europe/Lisbon');
  });

  it('rejeita UTC/GMT — não dizem nada sobre o contato', () => {
    expect(normalizeTimezoneInput('UTC')).toBeNull();
    expect(normalizeTimezoneInput('Etc/UTC')).toBeNull();
  });

  it('rejeita lixo, tipos errados e payload longo', () => {
    expect(normalizeTimezoneInput('<script>')).toBeNull();
    expect(normalizeTimezoneInput('Nao/Existe')).toBeNull();
    expect(normalizeTimezoneInput(42)).toBeNull();
    expect(normalizeTimezoneInput(null)).toBeNull();
    expect(normalizeTimezoneInput('A'.repeat(200))).toBeNull();
  });
});
