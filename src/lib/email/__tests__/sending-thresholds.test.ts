// =============================================================
// Sending thresholds (modelo Omnisend) — matriz completa de
// alcance × estado do contato, para e-mail e SMS.
//
// Três garantias que estes testes travam:
//  1. o padrão NÃO muda o comportamento de nenhum fluxo existente;
//  2. cada nível alcança exatamente um degrau a mais que o anterior;
//  3. o piso técnico (bounce, denúncia de spam, endereço inválido)
//     nunca é liberado — nem no nível "todos".
// =============================================================

import { describe, it, expect } from 'vitest';
import {
  isEmailBlocked,
  isEmailBlockedForThreshold,
  isSmsBlockedForThreshold,
  normalizeThreshold,
} from '../consent';

describe('normalizeThreshold', () => {
  it('cai em "subscribed" quando não configurado', () => {
    expect(normalizeThreshold(undefined)).toBe('subscribed');
    expect(normalizeThreshold(null)).toBe('subscribed');
    expect(normalizeThreshold('')).toBe('subscribed');
    expect(normalizeThreshold('valor-invalido')).toBe('subscribed');
  });

  it('aceita os três níveis da Omnisend', () => {
    expect(normalizeThreshold('subscribed')).toBe('subscribed');
    expect(normalizeThreshold('nonSubscribed')).toBe('nonSubscribed');
    expect(normalizeThreshold('non_subscribed')).toBe('nonSubscribed');
    expect(normalizeThreshold('all')).toBe('all');
  });
});

describe('e-mail — o padrão preserva o comportamento atual', () => {
  const casos: Array<[string, unknown, unknown]> = [
    ['consentimento explícito', true, 'subscribed'],
    ['sem sinal nenhum (legado)', null, null],
    ['consentimento negado', false, null],
    ['double opt-in pendente', 'pending', null],
    ['descadastrado', null, 'unsubscribed'],
    ['bounce definitivo', null, 'bounced'],
    ['denúncia de spam', null, 'complained'],
  ];

  it.each(casos)('%s decide igual ao guard antigo', (_nome, consent, status) => {
    expect(isEmailBlockedForThreshold(consent, status, 'subscribed'))
      .toBe(isEmailBlocked(consent, status));
  });

  it('sem threshold informado também usa o padrão', () => {
    expect(isEmailBlockedForThreshold('pending', null)).toBe(true);
    expect(isEmailBlockedForThreshold(true, 'subscribed')).toBe(false);
  });
});

describe('e-mail — nível "inscritos + não inscritos"', () => {
  const t = 'nonSubscribed' as const;

  it('alcança quem nunca optou (caso do carrinho abandonado)', () => {
    expect(isEmailBlockedForThreshold(false, null, t)).toBe(false);
    expect(isEmailBlockedForThreshold('pending', null, t)).toBe(false);
    expect(isEmailBlockedForThreshold(null, null, t)).toBe(false);
  });

  it('continua respeitando quem pediu descadastro', () => {
    expect(isEmailBlockedForThreshold(null, 'unsubscribed', t)).toBe(true);
    expect(isEmailBlockedForThreshold('revoked', null, t)).toBe(true);
    expect(isEmailBlockedForThreshold('denied', null, t)).toBe(true);
  });

  it('não libera bounce nem denúncia', () => {
    expect(isEmailBlockedForThreshold(true, 'bounced', t)).toBe(true);
    expect(isEmailBlockedForThreshold(true, 'complained', t)).toBe(true);
    expect(isEmailBlockedForThreshold(true, 'invalid', t)).toBe(true);
  });
});

describe('e-mail — nível "todos" (transacional)', () => {
  const t = 'all' as const;

  it('alcança inclusive quem se descadastrou', () => {
    expect(isEmailBlockedForThreshold(null, 'unsubscribed', t)).toBe(false);
    expect(isEmailBlockedForThreshold(false, null, t)).toBe(false);
  });

  it('NÃO fura o piso técnico', () => {
    expect(isEmailBlockedForThreshold(true, 'bounced', t)).toBe(true);
    expect(isEmailBlockedForThreshold(true, 'complained', t)).toBe(true);
    expect(isEmailBlockedForThreshold(true, 'invalid', t)).toBe(true);
  });
});

describe('SMS', () => {
  it('sem configuração explícita, não filtra nada (fluxos ativos seguem iguais)', () => {
    expect(isSmsBlockedForThreshold(null, null)).toBe(false);
    expect(isSmsBlockedForThreshold(false, null)).toBe(false);
  });

  it('em "apenas inscritos", exige sinal positivo de consentimento', () => {
    expect(isSmsBlockedForThreshold(true, null, 'subscribed')).toBe(false);
    expect(isSmsBlockedForThreshold(false, null, 'subscribed')).toBe(true);
    expect(isSmsBlockedForThreshold(null, null, 'subscribed')).toBe(true);
  });

  it('em "inscritos + não inscritos", alcança quem nunca optou mas não o descadastrado', () => {
    expect(isSmsBlockedForThreshold(false, null, 'nonSubscribed')).toBe(false);
    expect(isSmsBlockedForThreshold(null, 'unsubscribed', 'nonSubscribed')).toBe(true);
  });

  it('nunca envia para bounce/denúncia, em nenhum nível', () => {
    for (const t of ['subscribed', 'nonSubscribed', 'all'] as const) {
      expect(isSmsBlockedForThreshold(true, 'bounced', t)).toBe(true);
      expect(isSmsBlockedForThreshold(true, 'complained', t)).toBe(true);
    }
  });
});

describe('os níveis são progressivamente mais amplos', () => {
  const contatos: Array<[unknown, unknown]> = [
    [true, 'subscribed'],
    [null, null],
    [false, null],
    ['pending', null],
    [null, 'unsubscribed'],
    [true, 'bounced'],
  ];

  it('nunca bloqueia mais ao afrouxar o nível', () => {
    for (const [consent, status] of contatos) {
      const estrito = isEmailBlockedForThreshold(consent, status, 'subscribed');
      const medio = isEmailBlockedForThreshold(consent, status, 'nonSubscribed');
      const amplo = isEmailBlockedForThreshold(consent, status, 'all');
      // bloqueado(estrito) >= bloqueado(medio) >= bloqueado(amplo)
      expect(Number(estrito)).toBeGreaterThanOrEqual(Number(medio));
      expect(Number(medio)).toBeGreaterThanOrEqual(Number(amplo));
    }
  });
});
