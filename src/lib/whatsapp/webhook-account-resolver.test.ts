import { describe, it, expect } from 'vitest';
import { resolveWebhookAccount } from './webhook-account-resolver';

const ORG_A = { id: 'acc-a', organization_id: 'org-a', waba_id: '111' };
const ORG_B = { id: 'acc-b', organization_id: 'org-b', waba_id: '222' };
const LEGACY = { id: 'acc-legacy', organization_id: 'org-a', waba_id: null };

describe('resolveWebhookAccount', () => {
  it('nenhuma linha => not_found', () => {
    const r = resolveWebhookAccount([], '111');
    expect(r.account).toBeNull();
    expect(r).toMatchObject({ reason: 'not_found', candidates: 0 });
  });

  it('null/undefined tratados como lista vazia', () => {
    expect(resolveWebhookAccount(null, '111').account).toBeNull();
    expect(resolveWebhookAccount(undefined, '111').account).toBeNull();
  });

  it('match exato de waba_id ganha', () => {
    const r = resolveWebhookAccount([ORG_A, ORG_B], '222');
    expect(r.account).toBe(ORG_B);
    expect(r).toMatchObject({ matchedBy: 'waba_id' });
  });

  it('REGRESSAO: linha legada com waba_id NULL nao e mais descartada', () => {
    // Era o bug: `.eq('waba_id', '111')` no PostgREST nunca casa com NULL,
    // entao esta linha era invisivel e o inbound morria em silencio.
    const r = resolveWebhookAccount([LEGACY], '111');
    expect(r.account).toBe(LEGACY);
    expect(r).toMatchObject({ matchedBy: 'legacy_null_waba' });
  });

  it('match exato tem precedencia sobre linha legada', () => {
    const r = resolveWebhookAccount([LEGACY, ORG_A], '111');
    expect(r.account).toBe(ORG_A);
    expect(r).toMatchObject({ matchedBy: 'waba_id' });
  });

  it('NAO casa com linha de outro waba_id (vazamento cross-tenant)', () => {
    // O ponto da migration 20260607: phone_number_id sozinho nao autoriza.
    const r = resolveWebhookAccount([ORG_B], '111');
    expect(r.account).toBeNull();
    expect(r).toMatchObject({ reason: 'not_found', candidates: 1 });
  });

  it('duas linhas com o mesmo waba_id => ambiguous (banco corrompido)', () => {
    const dup = { id: 'acc-dup', organization_id: 'org-c', waba_id: '111' };
    const r = resolveWebhookAccount([ORG_A, dup], '111');
    expect(r.account).toBeNull();
    expect(r).toMatchObject({ reason: 'ambiguous', candidates: 2 });
  });

  it('duas linhas legadas => ambiguous, nunca chuta', () => {
    const legacy2 = { id: 'acc-legacy-2', organization_id: 'org-b', waba_id: null };
    const r = resolveWebhookAccount([LEGACY, legacy2], '111');
    expect(r.account).toBeNull();
    expect(r).toMatchObject({ reason: 'ambiguous', candidates: 2 });
  });

  it('sem entry.id e uma linha => casa por phone_number_id', () => {
    const r = resolveWebhookAccount([ORG_A], undefined);
    expect(r.account).toBe(ORG_A);
    expect(r).toMatchObject({ matchedBy: 'phone_number_id' });
  });

  it('sem entry.id e varias linhas => ambiguous', () => {
    const r = resolveWebhookAccount([ORG_A, ORG_B], undefined);
    expect(r.account).toBeNull();
    expect(r).toMatchObject({ reason: 'ambiguous', candidates: 2 });
  });

  it('compara waba_id como string (Meta manda number as vezes)', () => {
    const numeric = { id: 'acc-n', organization_id: 'org-n', waba_id: 111 as any };
    const r = resolveWebhookAccount([numeric], '111');
    expect(r.account).toBe(numeric);
  });

  it('waba_id undefined na linha conta como legado (nao como divergente)', () => {
    const undef = { id: 'acc-u', organization_id: 'org-u' } as { waba_id?: string | null };
    const r = resolveWebhookAccount([undef], '111');
    expect(r.account).toBe(undef);
    expect(r).toMatchObject({ matchedBy: 'legacy_null_waba' });
  });

  it('entry.id vazio cai no caminho sem waba_id', () => {
    // '' e falsy: nao da para desempatar, entao vale a regra de uma linha so.
    const r = resolveWebhookAccount([ORG_A], '');
    expect(r).toMatchObject({ matchedBy: 'phone_number_id' });
  });
});
