import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Cliente admin
let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key && !url.includes('placeholder')) {
      supabaseAdmin = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }
  return supabaseAdmin;
}

// Obter usuário autenticado
async function getAuthUser() {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const cookieStore = cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  
  if (!accessToken) return null;
  
  const { data: { user }, error } = await admin.auth.getUser(accessToken);
  if (error || !user) return null;
  
  return { user, admin };
}

// POST - Upload de avatar
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, admin } = auth;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Validar tipo de arquivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Tipo de arquivo não permitido. Use JPG, PNG, GIF ou WebP.' 
      }, { status: 400 });
    }

    // Validar tamanho (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'Arquivo muito grande. Máximo 5MB.' 
      }, { status: 400 });
    }

    // Gerar nome único
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // Converter File para ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    // Deletar avatar anterior se existir
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single();

    if (existingProfile?.avatar_url) {
      try {
        const oldPath = existingProfile.avatar_url.split('/').slice(-2).join('/');
        await admin.storage.from('avatars').remove([oldPath]);
      } catch (e) {
        console.log('Could not delete old avatar:', e);
      }
    }

    // Upload para Supabase Storage
    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Obter URL pública
    const { data: { publicUrl } } = admin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Verificar se perfil existe
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (profile) {
      // Atualizar perfil existente
      await admin
        .from('profiles')
        .update({ 
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
    } else {
      // Criar perfil se não existir
      await admin
        .from('profiles')
        .insert({
          id: user.id,
          organization_id: user.user_metadata?.organization_id,
          avatar_url: publicUrl,
          role: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }

    // Atualizar user_metadata também
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { 
        ...user.user_metadata,
        avatar_url: publicUrl 
      }
    });

    return NextResponse.json({ 
      success: true,
      avatar_url: publicUrl,
      message: 'Avatar atualizado com sucesso'
    });

  } catch (error: any) {
    console.error('Avatar upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Remover avatar
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, admin } = auth;

    // Buscar avatar atual
    const { data: profile } = await admin
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single();

    if (profile?.avatar_url) {
      try {
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
        await admin.storage.from('avatars').remove([oldPath]);
      } catch (e) {
        console.log('Could not delete avatar from storage:', e);
      }
    }

    // Atualizar perfil
    await admin
      .from('profiles')
      .update({ 
        avatar_url: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Atualizar user_metadata
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { 
        ...user.user_metadata,
        avatar_url: null 
      }
    });

    return NextResponse.json({ 
      success: true,
      message: 'Avatar removido com sucesso'
    });

  } catch (error: any) {
    console.error('Avatar delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
