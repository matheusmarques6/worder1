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
  
  return { user, admin, accessToken };
}

// GET - Buscar perfil do usuário
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, admin } = auth;

    // Buscar perfil
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Se perfil não existe, criar um básico
    if (profileError && profileError.code === 'PGRST116') {
      const firstName = user.user_metadata?.first_name || user.user_metadata?.name?.split(' ')[0] || '';
      const lastName = user.user_metadata?.last_name || user.user_metadata?.name?.split(' ').slice(1).join(' ') || '';
      
      const { data: newProfile, error: createError } = await admin
        .from('profiles')
        .insert({
          id: user.id,
          organization_id: user.user_metadata?.organization_id,
          first_name: firstName,
          last_name: lastName,
          role: user.user_metadata?.role || 'admin',
          phone: user.phone || user.user_metadata?.phone || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating profile:', createError);
        return NextResponse.json({ 
          profile: {
            id: user.id,
            email: user.email,
            first_name: firstName,
            last_name: lastName,
            role: user.user_metadata?.role || 'admin',
            phone: user.phone || '',
            avatar_url: user.user_metadata?.avatar_url || null,
            organization_id: user.user_metadata?.organization_id,
          }
        });
      }

      return NextResponse.json({ 
        profile: {
          ...newProfile,
          email: user.email,
        }
      });
    }

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      profile: {
        ...profile,
        email: user.email,
        user_metadata: user.user_metadata,
      }
    });

  } catch (error: any) {
    console.error('Profile GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT/PATCH - Atualizar perfil
export async function PUT(request: NextRequest) {
  return handleProfileUpdate(request);
}

export async function PATCH(request: NextRequest) {
  return handleProfileUpdate(request);
}

async function handleProfileUpdate(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, admin } = auth;
    const body = await request.json();
    const { name, first_name, last_name, avatar_url, phone } = body;

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name) {
      updateData.first_name = name.split(' ')[0];
      updateData.last_name = name.split(' ').slice(1).join(' ') || '';
    }
    
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (phone !== undefined) updateData.phone = phone;

    // Verificar se perfil existe
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    let profile;
    if (existingProfile) {
      const { data, error } = await admin
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      profile = data;
    } else {
      const { data, error } = await admin
        .from('profiles')
        .insert({
          id: user.id,
          organization_id: user.user_metadata?.organization_id,
          role: 'admin',
          ...updateData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      profile = data;
    }

    // Atualizar user_metadata no Auth
    const newMetadata: Record<string, any> = { ...user.user_metadata };
    if (first_name || name) newMetadata.first_name = updateData.first_name;
    if (last_name || name) newMetadata.last_name = updateData.last_name;
    if (phone) newMetadata.phone = phone;
    newMetadata.name = `${updateData.first_name || ''} ${updateData.last_name || ''}`.trim();

    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: newMetadata
    });

    // Se é um agente, atualizar também na tabela agents
    if (user.user_metadata?.is_agent && user.user_metadata?.agent_id) {
      await admin
        .from('agents')
        .update({ 
          name: newMetadata.name,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.user_metadata.agent_id);
    }

    return NextResponse.json({ 
      profile,
      message: 'Perfil atualizado com sucesso' 
    });

  } catch (error: any) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Ações especiais (reset password)
export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { action, email } = body;

    if (action === 'reset-password') {
      const auth = await getAuthUser();
      const userEmail = email || auth?.user?.email;

      if (!userEmail) {
        return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 });
      }

      const { error } = await admin.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password`,
      });

      if (error) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Email de recuperação enviado com sucesso'
      });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error: any) {
    console.error('Profile POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
