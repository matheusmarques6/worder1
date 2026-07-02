// =============================================
// API: Contact Attachments
// src/app/api/contacts/[id]/attachments/route.ts
// GET - Listar anexos
// POST - Upload de anexo
// DELETE - Remover anexo
// =============================================
// ⚠️ SEGURANÇA: OBRIGATÓRIO validar organization_id
// NUNCA permitir acesso a dados de outra organização
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// =============================================
// Helper: Resolver as orgs do chamador a partir da SESSÃO
// =============================================
async function resolveCallerOrgIds(userId: string, primaryOrgId: string): Promise<string[]> {
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);
  return [...new Set([primaryOrgId, ...((memberships || []).map((m: any) => m.organization_id))])];
}

// =============================================
// Helper: Validar acesso ao contato
// A org de confiança vem da SESSÃO (orgIds), nunca do request.
// =============================================
async function validateContactAccess(contactId: string, orgIds: string[]) {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_contacts')
    .select('id, organization_id')
    .eq('id', contactId)
    .single();

  if (error || !data) {
    return { valid: false as const };
  }

  // ⚠️ CRÍTICO: o contato deve pertencer a uma org do chamador
  if (!orgIds.includes(data.organization_id)) {
    console.error(`[SECURITY VIOLATION] Contact ${contactId} access denied for orgs ${orgIds.join(',')}`);
    return { valid: false as const };
  }

  return { valid: true as const, contact: data, organizationId: data.organization_id as string };
}

// =============================================
// GET - Listar anexos do contato
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const contactId = params.id;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const orgIds = await resolveCallerOrgIds(auth.user.id, auth.user.organization_id);

    // ⚠️ SEGURANÇA: Validar acesso ao contato (org vem da sessão)
    const validation = await validateContactAccess(contactId, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }
    const organizationId = validation.organizationId;

    // ⚠️ SEGURANÇA: Buscar anexos FILTRADOS por organization_id
    let query = supabaseAdmin
      .from('contact_attachments')
      .select('*')
      .eq('contact_id', contactId)
      .eq('organization_id', organizationId) // ⚠️ CRÍTICO
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ 
      attachments: data || [],
      count: data?.length || 0
    });
  } catch (error: any) {
    console.error('[Attachments GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Upload de anexo
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const contactId = params.id;
    const formData = await request.formData();

    const file = formData.get('file') as File;
    const description = formData.get('description') as string || '';
    const category = formData.get('category') as string || 'document';
    const uploadedByName = formData.get('uploaded_by_name') as string || 'Usuário';

    if (!file) {
      return NextResponse.json({ error: 'Arquivo é obrigatório' }, { status: 400 });
    }

    const orgIds = await resolveCallerOrgIds(auth.user.id, auth.user.organization_id);

    // ⚠️ SEGURANÇA: Validar acesso ao contato (org vem da sessão)
    const validation = await validateContactAccess(contactId, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }
    const organizationId = validation.organizationId;

    // Validar tamanho (máx 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo: 10MB' }, { status: 400 });
    }

    // Validar tipo de arquivo
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Tipo de arquivo não permitido. Use: imagens, PDF, Word, Excel ou texto.' 
      }, { status: 400 });
    }

    // Gerar nome único para o arquivo - usando organization_id no path
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}-${sanitizedName}`;
    const filePath = `${organizationId}/${contactId}/${fileName}`; // ⚠️ Isolamento por org

    // Converter File para Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload para Supabase Storage
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('contact-files')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('[Attachments] Upload error:', uploadError);
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }

    // Gerar URL pública
    const { data: urlData } = supabaseAdmin
      .storage
      .from('contact-files')
      .getPublicUrl(filePath);

    // ⚠️ SEGURANÇA: Salvar no banco SEMPRE com organization_id
    const { data: attachment, error: dbError } = await supabaseAdmin
      .from('contact_attachments')
      .insert({
        organization_id: organizationId, // ⚠️ CRÍTICO
        contact_id: contactId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        description: description.trim(),
        category,
        uploaded_by_name: uploadedByName,
      })
      .select()
      .single();

    if (dbError) {
      // Se falhar no banco, tentar remover o arquivo do storage
      await supabaseAdmin.storage.from('contact-files').remove([filePath]);
      throw dbError;
    }

    console.log('[Attachments] Upload success:', attachment.id, 'Org:', organizationId);

    return NextResponse.json({ 
      attachment,
      message: 'Arquivo enviado com sucesso'
    });
  } catch (error: any) {
    console.error('[Attachments POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Remover anexo
// =============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const contactId = params.id;
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachment_id');

    if (!attachmentId) {
      return NextResponse.json({ error: 'attachment_id é obrigatório' }, { status: 400 });
    }

    const orgIds = await resolveCallerOrgIds(auth.user.id, auth.user.organization_id);

    // ⚠️ SEGURANÇA: Validar acesso ao contato (org vem da sessão)
    const validation = await validateContactAccess(contactId, orgIds);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }
    const organizationId = validation.organizationId;

    // ⚠️ SEGURANÇA: Buscar anexo FILTRADO por organization_id
    const { data: attachment, error: fetchError } = await supabaseAdmin
      .from('contact_attachments')
      .select('*')
      .eq('id', attachmentId)
      .eq('contact_id', contactId)
      .eq('organization_id', organizationId) // ⚠️ CRÍTICO
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });
    }

    // Verificação adicional de segurança
    if (attachment.organization_id !== organizationId) {
      console.error(`[SECURITY VIOLATION] Attachment ${attachmentId} access denied for org ${organizationId}`);
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Extrair caminho do arquivo da URL
    const fileUrl = attachment.file_url;
    const urlParts = fileUrl.split('/contact-files/');
    const filePath = urlParts.length > 1 ? urlParts[1] : null;

    // Remover do Storage (se possível)
    if (filePath) {
      const { error: storageError } = await supabaseAdmin
        .storage
        .from('contact-files')
        .remove([filePath]);

      if (storageError) {
        console.warn('[Attachments] Storage delete warning:', storageError);
        // Continua mesmo se falhar no storage
      }
    }

    // ⚠️ SEGURANÇA: Remover do banco com filtro de organization_id
    const { error: deleteError } = await supabaseAdmin
      .from('contact_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('organization_id', organizationId); // ⚠️ CRÍTICO

    if (deleteError) throw deleteError;

    console.log('[Attachments] Deleted:', attachmentId, 'Org:', organizationId);

    return NextResponse.json({ 
      success: true,
      message: 'Anexo removido com sucesso'
    });
  } catch (error: any) {
    console.error('[Attachments DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
