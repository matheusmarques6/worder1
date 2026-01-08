import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { encryptCredential, decryptCredential, maskSensitive } from '@/lib/automation/credential-encryption';

// ============================================
// GET - Obter credencial específica
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const { id } = await params;

    // Buscar credencial - RLS filtra automaticamente
    const { data: credential, error } = await supabase
      .from('credentials')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !credential) {
      return NextResponse.json({ error: 'Credencial não encontrada' }, { status: 404 });
    }

    // Decriptar para mascarar
    let maskedFields: Record<string, string> = {};
    try {
      const decrypted = decryptCredential(credential.encrypted_data);
      maskedFields = maskSensitive(decrypted);
    } catch {
      // Se falhar decriptação, retorna vazio
    }

    return NextResponse.json({
      credential: {
        id: credential.id,
        name: credential.name,
        type: credential.type,
        masked_fields: maskedFields,
        automations_using: credential.automations_using || [],
        last_used_at: credential.last_used_at,
        last_test_at: credential.last_test_at,
        last_test_success: credential.last_test_success,
        created_at: credential.created_at,
        updated_at: credential.updated_at,
      },
    });

  } catch (error: any) {
    console.error('Erro ao buscar credencial:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// PUT - Atualizar credencial
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, data } = body;

    // Verificar se credencial existe - RLS filtra automaticamente
    const { data: existing, error: fetchError } = await supabase
      .from('credentials')
      .select('id, encrypted_data')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Credencial não encontrada' }, { status: 404 });
    }

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name) {
      updateData.name = name;
    }

    // Se novos dados foram fornecidos, criptografar
    if (data && Object.keys(data).length > 0) {
      // Mesclar com dados existentes (para não sobrescrever campos não editados)
      let existingData: Record<string, any> = {};
      try {
        existingData = decryptCredential(existing.encrypted_data);
      } catch {
        // Se falhar, começar do zero
      }

      // Mesclar - apenas campos não vazios sobrescrevem
      const mergedData = { ...existingData };
      for (const [key, value] of Object.entries(data)) {
        if (value && value !== '••••••••') {
          mergedData[key] = value;
        }
      }

      updateData.encrypted_data = encryptCredential(mergedData);
    }

    // Atualizar
    const { error: updateError } = await supabase
      .from('credentials')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, message: 'Credencial atualizada' });

  } catch (error: any) {
    console.error('Erro ao atualizar credencial:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// DELETE - Excluir credencial
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id } = await params;

    // Verificar se está em uso
    const { data: credential, error: fetchError } = await supabase
      .from('credentials')
      .select('id, name, automations_using')
      .eq('id', id)
      .single();

    if (fetchError || !credential) {
      return NextResponse.json({ error: 'Credencial não encontrada' }, { status: 404 });
    }

    // Avisar se está em uso (mas permitir deletar)
    const inUseBy = credential.automations_using || [];
    
    // Deletar
    const { error: deleteError } = await supabase
      .from('credentials')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Credencial excluída',
      warning: inUseBy.length > 0 
        ? `Esta credencial estava sendo usada por ${inUseBy.length} automação(ões)`
        : undefined,
    });

  } catch (error: any) {
    console.error('Erro ao excluir credencial:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
