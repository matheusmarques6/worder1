import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWebhookSignature } from './cloud-api';

const APP_SECRET = 'test_app_secret_42';

function signFixture(body: string): string {
  return (
    'sha256=' +
    createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')
  );
}

describe('verifyWebhookSignature', () => {
  it('accepts a valid Meta-style signature', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const sig = signFixture(body);
    expect(await verifyWebhookSignature(body, sig, APP_SECRET)).toBe(true);
  });

  it('rejects when body is tampered', async () => {
    const original = '{"a":1}';
    const sig = signFixture(original);
    const tampered = '{"a":2}';
    expect(await verifyWebhookSignature(tampered, sig, APP_SECRET)).toBe(false);
  });

  it('rejects when secret is wrong', async () => {
    const body = '{"x":true}';
    const sig = signFixture(body);
    expect(await verifyWebhookSignature(body, sig, 'wrong_secret')).toBe(false);
  });

  it('rejects empty / missing signature', async () => {
    expect(await verifyWebhookSignature('{}', null, APP_SECRET)).toBe(false);
    expect(await verifyWebhookSignature('{}', undefined, APP_SECRET)).toBe(false);
    expect(await verifyWebhookSignature('{}', '', APP_SECRET)).toBe(false);
  });

  it('accepts signature without sha256= prefix', async () => {
    const body = '{"y":1}';
    const sig = signFixture(body);
    const bare = sig.replace('sha256=', '');
    expect(await verifyWebhookSignature(body, bare, APP_SECRET)).toBe(true);
  });

  it('short-circuits on length mismatch (no crash)', async () => {
    const body = '{}';
    expect(await verifyWebhookSignature(body, 'sha256=deadbeef', APP_SECRET)).toBe(
      false
    );
  });
});
