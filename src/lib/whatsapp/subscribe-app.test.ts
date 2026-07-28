import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  subscribeAppToWABA,
  WABA_SUBSCRIBED_FIELDS,
  WhatsAppCloudError,
  META_BASE_URL,
} from './cloud-api';

const mockFetch = vi.fn();

describe('subscribeAppToWABA', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /{wabaId}/subscribed_apps with explicit subscribed_fields body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const result = await subscribeAppToWABA({ wabaId: '111222333', accessToken: 'tok_abc' });

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${META_BASE_URL}/111222333/subscribed_apps`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok_abc');

    const body = JSON.parse(init.body);
    expect(body.subscribed_fields).toEqual([
      'messages',
      'message_template_status_update',
      'template_category_update',
      'phone_number_quality_update',
    ]);
  });

  it('always includes "messages" — the field that makes inbound work', () => {
    expect(WABA_SUBSCRIBED_FIELDS).toContain('messages');
  });

  it('throws WhatsAppCloudError when Meta returns an error payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Unsupported post request', code: 100 } }),
    });

    await expect(
      subscribeAppToWABA({ wabaId: '111222333', accessToken: 'tok_abc' })
    ).rejects.toBeInstanceOf(WhatsAppCloudError);
  });
});
