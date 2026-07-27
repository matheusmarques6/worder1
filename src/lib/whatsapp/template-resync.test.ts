import { describe, it, expect } from 'vitest';
import { buildResyncUpdate } from './template-resync';
import type { Template } from './cloud-api';

const base: Template = {
  id: '123456789',
  name: 'order_update',
  language: 'pt_BR',
  status: 'APPROVED',
  category: 'UTILITY',
  components: [{ type: 'BODY', text: 'Oi {{1}}' }],
};

const FIXED_NOW = new Date('2026-07-27T12:00:00.000Z');

describe('buildResyncUpdate', () => {
  it('returns null when Meta status is still PENDING', () => {
    expect(buildResyncUpdate({ ...base, status: 'PENDING' }, FIXED_NOW)).toBeNull();
  });

  it('returns null when Meta status is empty', () => {
    expect(buildResyncUpdate({ ...base, status: '' }, FIXED_NOW)).toBeNull();
  });

  it('maps APPROVED to an update with status, components and synced_at', () => {
    const update = buildResyncUpdate(base, FIXED_NOW);
    expect(update).toEqual({
      status: 'APPROVED',
      components: base.components,
      synced_at: '2026-07-27T12:00:00.000Z',
    });
  });

  it('omits components when Meta returns none', () => {
    const update = buildResyncUpdate(
      { ...base, components: undefined as unknown as any[] },
      FIXED_NOW
    );
    expect(update).not.toBeNull();
    expect(update).not.toHaveProperty('components');
  });

  it('maps REJECTED with rejected_reason into rejection_reason', () => {
    const rejected = {
      ...base,
      status: 'REJECTED',
      rejected_reason: 'INVALID_FORMAT',
    } as Template;
    expect(buildResyncUpdate(rejected, FIXED_NOW)).toEqual({
      status: 'REJECTED',
      components: base.components,
      rejection_reason: 'INVALID_FORMAT',
      synced_at: '2026-07-27T12:00:00.000Z',
    });
  });

  it('falls back to quality_score.reason, then null, for REJECTED', () => {
    const viaQuality = {
      ...base,
      status: 'REJECTED',
      quality_score: { reason: 'LOW_QUALITY' },
    } as Template;
    expect(buildResyncUpdate(viaQuality, FIXED_NOW)?.rejection_reason).toBe('LOW_QUALITY');

    const noReason = { ...base, status: 'REJECTED' } as Template;
    expect(buildResyncUpdate(noReason, FIXED_NOW)?.rejection_reason).toBeNull();
  });

  it('does not set rejection_reason for non-REJECTED statuses', () => {
    const update = buildResyncUpdate({ ...base, status: 'PAUSED' }, FIXED_NOW);
    expect(update).not.toBeNull();
    expect(update).not.toHaveProperty('rejection_reason');
  });
});
