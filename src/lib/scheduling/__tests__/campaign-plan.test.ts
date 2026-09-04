// =============================================================
// Campanha no fuso do destinatário.
//
// A promessa é: "todo mundo recebe às 09:00 do relógio DELE, no dia
// que eu marquei". O que estes testes travam:
//
//   • o horário de parede sai do fuso de quem agendou;
//   • quem já passou daquele horário local recebe agora, não amanhã;
//   • contatos viram grupos por fuso, não um job por pessoa;
//   • quem não tem fuso conhecido cai no da loja, nunca fora do ar.
// =============================================================

import { describe, it, expect } from 'vitest';
import { planRecipientTimezoneSend, summarizePlan, recipientModeLeadTimeMs } from '../campaign-plan';
import { partsInTz } from '../timezone';

const SP = 'America/Sao_Paulo';

function contato(id: string, timezone?: string | null, country?: string | null) {
  return { id, timezone: timezone ?? null, country: country ?? null };
}

describe('planRecipientTimezoneSend', () => {
  // Lojista em São Paulo marcou 10/09 às 09:00 → 12:00Z.
  const scheduledAt = new Date('2026-09-10T12:00:00Z');

  it('entrega no horário de parede escolhido, em cada fuso', () => {
    const buckets = planRecipientTimezoneSend(
      [contato('a', SP), contato('b', 'Europe/Lisbon'), contato('c', 'Asia/Tokyo')],
      { scheduledAt, authorTimezone: SP, fallbackTimezone: SP, now: new Date('2026-09-09T12:00:00Z') }
    );
    expect(buckets).toHaveLength(3);
    for (const b of buckets) {
      const p = partsInTz(b.timezone, b.sendAt);
      expect(p.hour).toBe(9);
      expect(p.day).toBe(10);
    }
  });

  it('o fuso mais a leste sai primeiro', () => {
    const buckets = planRecipientTimezoneSend(
      [contato('a', SP), contato('b', 'Asia/Tokyo'), contato('c', 'Europe/Lisbon')],
      { scheduledAt, authorTimezone: SP, now: new Date('2026-09-09T12:00:00Z') }
    );
    expect(buckets[0].timezone).toBe('Asia/Tokyo');
    expect(buckets[buckets.length - 1].timezone).toBe(SP);
  });

  it('quem já passou do horário local recebe agora, não amanhã', () => {
    // Começando às 09:30 de São Paulo, Tóquio já passou MUITO das 09:00.
    const buckets = planRecipientTimezoneSend(
      [contato('a', 'Asia/Tokyo')],
      { scheduledAt, authorTimezone: SP, now: new Date('2026-09-10T12:30:00Z') }
    );
    expect(buckets[0].delayMs).toBe(0);
  });

  it('agrupa por fuso — não gera um horário por contato', () => {
    const muitos = Array.from({ length: 500 }, (_, i) =>
      contato(`c${i}`, i % 2 === 0 ? SP : 'Europe/Lisbon')
    );
    const buckets = planRecipientTimezoneSend(muitos, {
      scheduledAt, authorTimezone: SP, now: new Date('2026-09-09T12:00:00Z'),
    });
    expect(buckets).toHaveLength(2);
    expect(buckets.reduce((s, b) => s + b.contacts.length, 0)).toBe(500);
  });

  it('deduz o fuso pelo país quando o contato não tem o dado do navegador', () => {
    const buckets = planRecipientTimezoneSend(
      [contato('a', null, 'PT'), contato('b', null, 'JP')],
      { scheduledAt, authorTimezone: SP, now: new Date('2026-09-09T12:00:00Z') }
    );
    expect(buckets.map((b) => b.timezone).sort()).toEqual(['Asia/Tokyo', 'Europe/Lisbon']);
  });

  it('sem nenhuma pista, o contato cai no fuso da loja', () => {
    const buckets = planRecipientTimezoneSend([contato('a')], {
      scheduledAt, authorTimezone: SP, fallbackTimezone: SP,
      now: new Date('2026-09-09T12:00:00Z'),
    });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].timezone).toBe(SP);
    // E recebe exatamente no instante marcado — igual ao modo fixo.
    expect(buckets[0].sendAt.toISOString()).toBe(scheduledAt.toISOString());
  });

  it('nenhum grupo espera mais que o teto de 26h', () => {
    const buckets = planRecipientTimezoneSend(
      [contato('a', 'Pacific/Kiritimati'), contato('b', 'Pacific/Midway')],
      { scheduledAt, authorTimezone: SP, now: new Date('2026-09-09T12:00:00Z') }
    );
    for (const b of buckets) expect(b.delayMs).toBeLessThanOrEqual(26 * 3600_000);
  });

  it('respeita o horário de verão do destinatário', () => {
    // 10/01: Nova York em UTC-5. 10/07: UTC-4. O relógio local tem de
    // marcar 09:00 nos dois casos.
    for (const iso of ['2026-01-10T12:00:00Z', '2026-07-10T12:00:00Z']) {
      const b = planRecipientTimezoneSend([contato('a', 'America/New_York')], {
        scheduledAt: new Date(iso), authorTimezone: SP,
        now: new Date(new Date(iso).getTime() - 86400_000),
      });
      expect(partsInTz('America/New_York', b[0].sendAt).hour).toBe(9);
    }
  });

  it('lista vazia não quebra', () => {
    expect(planRecipientTimezoneSend([], { scheduledAt, authorTimezone: SP })).toEqual([]);
  });
});

describe('summarizePlan', () => {
  it('resume fusos, contatos e a janela do primeiro ao último', () => {
    const buckets = planRecipientTimezoneSend(
      [contato('a', SP), contato('b', 'Asia/Tokyo'), contato('c', SP)],
      {
        scheduledAt: new Date('2026-09-10T12:00:00Z'),
        authorTimezone: SP, now: new Date('2026-09-09T12:00:00Z'),
      }
    );
    const s = summarizePlan(buckets);
    expect(s.timezones).toBe(2);
    expect(s.totalContacts).toBe(3);
    expect(s.firstSendAt!.getTime()).toBeLessThan(s.lastSendAt!.getTime());
  });

  it('plano vazio tem resumo vazio, sem null pointer', () => {
    expect(summarizePlan([])).toEqual({
      timezones: 0, totalContacts: 0, firstSendAt: null, lastSendAt: null,
    });
  });
});

describe('recipientModeLeadTimeMs', () => {
  it('cobre a distância do fuso mais a leste até o Brasil', () => {
    // UTC+14 chega ao horário local 17h antes de um lojista em UTC-3.
    expect(recipientModeLeadTimeMs()).toBeGreaterThanOrEqual(17 * 3600_000);
  });
});
