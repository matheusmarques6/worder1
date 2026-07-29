import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  deriveWebhookSubscription,
  getWABASubscribedApps,
  WABA_SUBSCRIBED_FIELDS,
  WhatsAppCloudError,
  META_BASE_URL,
} from './cloud-api';

const APP_ID = '999888777';

function entry(appId: string, fields?: string[]) {
  return {
    whatsapp_business_api_data: { id: appId, name: 'Worder' },
    ...(fields ? { subscribed_fields: fields } : {}),
  };
}

describe('deriveWebhookSubscription', () => {
  it('lista vazia => subscribed false, mesmo sem META_APP_ID', () => {
    // Caso decisivo: zero apps inscritos quebra o webhook seja qual for o app.
    const state = deriveWebhookSubscription({ data: [] }, undefined);
    expect(state.subscribed).toBe(false);
    expect(state.appCount).toBe(0);
    expect(state.missingFields).toEqual([...WABA_SUBSCRIBED_FIELDS]);
  });

  it('resposta sem array data => tratada como lista vazia', () => {
    expect(deriveWebhookSubscription({}, APP_ID).subscribed).toBe(false);
    expect(deriveWebhookSubscription(null, APP_ID).subscribed).toBe(false);
  });

  it('nosso app inscrito com todos os campos => subscribed true e sem faltas', () => {
    const state = deriveWebhookSubscription(
      { data: [entry(APP_ID, [...WABA_SUBSCRIBED_FIELDS])] },
      APP_ID,
    );
    expect(state.subscribed).toBe(true);
    expect(state.missingFields).toEqual([]);
    expect(state.note).toBeUndefined();
  });

  it('outro app inscrito, o nosso nao => subscribed false', () => {
    const state = deriveWebhookSubscription({ data: [entry('111')] }, APP_ID);
    expect(state.subscribed).toBe(false);
    expect(state.appCount).toBe(1);
    expect(state.note).toContain(APP_ID);
  });

  it('inscrito sem o campo messages => acusa a falta', () => {
    const state = deriveWebhookSubscription(
      { data: [entry(APP_ID, ['template_category_update'])] },
      APP_ID,
    );
    expect(state.subscribed).toBe(true);
    expect(state.missingFields).toContain('messages');
  });

  it('Meta nao reporta subscribed_fields => nao inventa campos ausentes', () => {
    // Alarme falso a evitar: ausencia de dado nao e ausencia de inscricao.
    const state = deriveWebhookSubscription({ data: [entry(APP_ID)] }, APP_ID);
    expect(state.subscribed).toBe(true);
    expect(state.missingFields).toEqual([]);
    expect(state.note).toContain('nao reportou');
  });

  it('sem META_APP_ID e com apps inscritos => indeterminado, nunca falso positivo', () => {
    const state = deriveWebhookSubscription({ data: [entry('111'), entry('222')] }, undefined);
    expect(state.subscribed).toBeNull();
    expect(state.appCount).toBe(2);
    expect(state.note).toContain('META_APP_ID');
  });

  it('sem META_APP_ID e com um unico inscrito => reporta os campos dele', () => {
    const state = deriveWebhookSubscription(
      { data: [entry('111', ['messages'])] },
      undefined,
    );
    expect(state.subscribed).toBeNull();
    expect(state.subscribedFields).toEqual(['messages']);
    expect(state.missingFields).toContain('template_category_update');
  });

  it('aceita subscribed_fields aninhado em whatsapp_business_api_data', () => {
    const state = deriveWebhookSubscription(
      {
        data: [
          {
            whatsapp_business_api_data: {
              id: APP_ID,
              subscribed_fields: [...WABA_SUBSCRIBED_FIELDS],
            },
          },
        ],
      },
      APP_ID,
    );
    expect(state.subscribed).toBe(true);
    expect(state.missingFields).toEqual([]);
  });

  it('aceita campos como objetos {name} alem de strings', () => {
    const state = deriveWebhookSubscription(
      { data: [{ whatsapp_business_api_data: { id: APP_ID }, subscribed_fields: [{ name: 'messages' }] }] },
      APP_ID,
    );
    expect(state.subscribedFields).toEqual(['messages']);
  });

  it('compara app id como string (Meta ora manda number, ora string)', () => {
    const state = deriveWebhookSubscription(
      { data: [{ whatsapp_business_api_data: { id: 999888777 } }] },
      APP_ID,
    );
    expect(state.subscribed).toBe(true);
  });
});

describe('getWABASubscribedApps', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('faz GET em /{wabaId}/subscribed_apps com o bearer', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });

    const result = await getWABASubscribedApps({ wabaId: '111222333', accessToken: 'tok_abc' });

    expect(result).toEqual({ data: [] });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${META_BASE_URL}/111222333/subscribed_apps`);
    expect(init.headers.Authorization).toBe('Bearer tok_abc');
  });

  it('lanca WhatsAppCloudError quando a Meta recusa', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'permission denied', code: 200 } }),
    });

    await expect(
      getWABASubscribedApps({ wabaId: '111222333', accessToken: 'tok_abc' }),
    ).rejects.toBeInstanceOf(WhatsAppCloudError);
  });
});
