/**
 * Inbound media pipeline — baixa mídia recebida da Meta e persiste no
 * Supabase Storage (bucket 'whatsapp-media', o mesmo do envio outbound
 * em /api/whatsapp/inbox/conversations/[id]/media).
 *
 * Chamado pelo worker /api/workers/whatsapp-inbound-media (QStash) ou
 * inline pelo webhook-processor quando QStash não está configurado.
 *
 * Contrato de erro: NUNCA lança. Falha de download marca
 * media_download_status='failed' e resolve — a mensagem já foi salva
 * pelo webhook-processor e continua visível no inbox (sem mídia).
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from './cloud-api';
import { getAccessToken } from './account-loader';
import { wlog } from '@/lib/observability/whatsapp-logger';

export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';
const SIGNED_URL_EXPIRY = 3600; // 1h — o GET de mensagens re-assina a cada leitura

export interface InboundMediaJob {
  cloudMessageId: string; // whatsapp_cloud_messages.id (uuid)
  accountId: string;      // whatsapp_business_accounts.id (uuid)
  organizationId: string;
}

export interface InboundMediaResult {
  ok: boolean;
  reason?: string;
}

// MIMEs que a Meta entrega em mídia inbound (Cloud API).
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp', // stickers chegam como image/webp
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',   // voice notes: "audio/ogg; codecs=opus"
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

export function extensionFromMime(mime: string): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  return MIME_EXT[base] || base.split('/')[1] || 'bin';
}

export function buildStoragePath(
  orgId: string,
  conversationId: string,
  messageDbId: string,
  mime: string,
): string {
  return `${orgId}/${conversationId}/${messageDbId}.${extensionFromMime(mime)}`;
}

export async function processInboundMedia(job: InboundMediaJob): Promise<InboundMediaResult> {
  const { data: row } = await supabase
    .from('whatsapp_cloud_messages')
    .select('id, media_id, conversation_id, message_type, content, media_download_status')
    .eq('id', job.cloudMessageId)
    .maybeSingle();

  if (!row) return { ok: false, reason: 'message_not_found' };
  if (!row.media_id) return { ok: false, reason: 'no_media_id' };
  // Idempotência: retry do QStash (ou corrida enqueue+inline) vira no-op.
  if (row.media_download_status === 'done') return { ok: true, reason: 'already_done' };

  const { data: account } = await supabase
    .from('whatsapp_business_accounts')
    .select('*')
    .eq('id', job.accountId)
    .maybeSingle();

  if (!account) return { ok: false, reason: 'account_not_found' };

  try {
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken: getAccessToken(account),
    });

    const { data, mimeType } = await client.downloadMedia(row.media_id);

    const storagePath = buildStoragePath(
      job.organizationId,
      row.conversation_id || 'no-conversation',
      row.id,
      mimeType,
    );

    const { error: uploadError } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(storagePath, Buffer.from(data), {
        contentType: mimeType || 'application/octet-stream',
        upsert: true, // retry sobrescreve o mesmo path (path é derivado do id da row)
        cacheControl: '3600',
      });
    if (uploadError) throw new Error(`storage_upload_failed: ${uploadError.message}`);

    let mediaUrl: string | null = null;
    const { data: signed } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
    if (signed?.signedUrl) mediaUrl = signed.signedUrl;

    const filename =
      row.content?.document?.filename ||
      `${row.message_type || 'media'}-${row.id}.${extensionFromMime(mimeType)}`;

    await supabase
      .from('whatsapp_cloud_messages')
      .update({
        media_url: mediaUrl,
        media_storage_path: storagePath,
        media_mime_type: mimeType,
        media_filename: filename,
        media_download_status: 'done',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    return { ok: true };
  } catch (err: any) {
    wlog.error('whatsapp.media.inbound_download_failed', {
      error: err?.message,
      cloud_message_id: job.cloudMessageId,
      media_id: row.media_id,
    });
    await supabase
      .from('whatsapp_cloud_messages')
      .update({
        media_download_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return { ok: false, reason: err?.message || 'download_failed' };
  }
}
