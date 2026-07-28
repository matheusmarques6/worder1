import type { Template } from './cloud-api';

/**
 * Payload applied to whatsapp_templates when Meta reports a status
 * change for a template stuck in PENDING. Keys that are absent are
 * left untouched by supabase-js `.update()`.
 */
export interface ResyncUpdate {
  status: string;
  components?: any[];
  rejection_reason?: string | null;
  synced_at: string;
}

/**
 * Maps a Meta template payload to the DB update, or null when there is
 * nothing to sync (status missing or still PENDING).
 */
export function buildResyncUpdate(
  metaTemplate: Template,
  now: Date = new Date()
): ResyncUpdate | null {
  if (!metaTemplate.status || metaTemplate.status === 'PENDING') {
    return null;
  }

  const update: ResyncUpdate = {
    status: metaTemplate.status,
    synced_at: now.toISOString(),
  };

  if (metaTemplate.components) {
    update.components = metaTemplate.components;
  }

  if (metaTemplate.status === 'REJECTED') {
    update.rejection_reason =
      (metaTemplate as any).rejected_reason ??
      (metaTemplate as any).quality_score?.reason ??
      null;
  }

  return update;
}
