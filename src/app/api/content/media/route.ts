// =============================================
// WORDER: Media Library API
// /api/content/media
// GET: list media files per store from Supabase Storage
// POST: upload file to storage + track in DB
// DELETE: remove file from storage + DB
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildMediaUrl, EMAIL_IMAGES_BUCKET } from '@/lib/media/public-url';

export const dynamic = 'force-dynamic';

const BUCKET = EMAIL_IMAGES_BUCKET;

// A URL que a biblioteca mostra, o lojista copia e o editor salva no
// template é a da CDN (cdn.worder.email), nunca a do Supabase. Antes
// esta rota devolvia getPublicUrl() cru — <projeto>.supabase.co — e a
// troca para a CDN só acontecia no envio, invisível para quem via a
// URL no editor. Ver src/lib/media/public-url.ts.
function publicUrlFor(storagePath: string): string {
  const url = buildMediaUrl(storagePath);
  // Sem host nenhum configurado (ambiente local sem .env), cai no
  // Supabase para a tela não ficar sem imagem.
  return url || supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const orgId = auth.user.organization_id;
  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get('store_id');

  try {
    // List files from storage under org folder
    // Structure: {org_id}/{store_id}/{filename} or {org_id}/{filename} (legacy/no store)
    const folders: string[] = [];

    if (storeId) {
      folders.push(`${orgId}/store_${storeId}`);
    }
    // Always include org-level (no store) files
    folders.push(orgId);

    const allFiles: any[] = [];

    for (const folder of folders) {
      const { data: files, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(folder, { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

      if (error) {
        console.error(`[Media] Error listing ${folder}:`, error);
        continue;
      }

      if (files) {
        for (const file of files) {
          // Skip folder entries (they have no metadata/size)
          if (!file.name || file.name.startsWith('.')) continue;
          // Skip subfolder entries when listing org root
          if (file.id === null && !file.metadata) continue;

          const filePath = `${folder}/${file.name}`;

          allFiles.push({
            id: file.id || filePath,
            name: file.name,
            url: publicUrlFor(filePath),
            size: file.metadata?.size || 0,
            type: file.metadata?.mimetype || 'image/png',
            created_at: file.created_at || new Date().toISOString(),
            storage_path: filePath,
            store_id: folder.includes('store_') ? storeId : null,
          });
        }
      }
    }

    // Sort by created_at desc
    allFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ files: allFiles });
  } catch (e: any) {
    console.error('[Media] GET Error:', e);
    return NextResponse.json({ files: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const orgId = auth.user.organization_id;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storeId = formData.get('store_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo não permitido. Use JPG, PNG, GIF, WebP ou SVG.' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 10MB.' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'png';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Path: {org_id}/store_{store_id}/{file} or {org_id}/{file}
    const folder = storeId ? `${orgId}/store_${storeId}` : orgId;
    const storagePath = `${folder}/${uniqueName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Cache de um ano: o nome do arquivo é único por upload, então
    // nunca precisa invalidar. O proxy de imagens do Gmail respeita o
    // Cache-Control da primeira busca e serve as aberturas seguintes
    // da própria borda — sem isto o padrão do Storage é ~1h.
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: '31536000, immutable',
      });

    if (uploadError) {
      console.error('[Media] Upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const result = {
      id: storagePath,
      name: file.name,
      url: publicUrlFor(storagePath),
      size: file.size,
      type: file.type,
      created_at: new Date().toISOString(),
      storage_path: storagePath,
      store_id: storeId || null,
    };

    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    console.error('[Media] POST Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const orgId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { storage_path, storage_paths, id } = body;

    // Um ou vários: `storage_paths` (lista) ou o `storage_path`/`id`
    // antigo. A seleção múltipla da biblioteca manda a lista.
    const pedidos: string[] = Array.isArray(storage_paths)
      ? storage_paths
      : [storage_path || id];
    const paths = pedidos.filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (paths.length === 0) {
      return NextResponse.json({ error: 'storage_path required' }, { status: 400 });
    }
    if (paths.length > 200) {
      return NextResponse.json({ error: 'Máximo de 200 arquivos por vez' }, { status: 400 });
    }

    // Segurança: TODOS os caminhos precisam ser da organização. Um
    // único caminho de fora derruba o pedido inteiro — nada de apagar
    // os "bons" e ignorar o intruso em silêncio.
    const fora = paths.find((p) => !p.startsWith(orgId + '/') || p.includes('..'));
    if (fora) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);

    if (error) {
      console.error('[Media] Delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // O storage devolve o que de fato removeu; o resto (já apagado,
    // caminho errado) volta como falha para a tela não fingir sucesso.
    const removidos = new Set((data || []).map((f: any) => f?.name).filter(Boolean));
    const deleted = paths.filter((p) => removidos.has(p));
    const failed = paths.filter((p) => !removidos.has(p));

    return NextResponse.json({ success: failed.length === 0, deleted, failed });
  } catch (e: any) {
    console.error('[Media] DELETE Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
