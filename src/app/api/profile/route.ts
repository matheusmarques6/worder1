import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// GET - Buscar perfil do usuário
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar perfil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

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

// PATCH - Atualizar perfil do usuário
export async function PATCH(request: NextRequest) {
  return handleProfileUpdate(request);
}

// PUT - Atualizar perfil do usuário (alias para PATCH)
export async function PUT(request: NextRequest) {
  return handleProfileUpdate(request);
}

// Função interna para atualizar perfil
async function handleProfileUpdate(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, first_name, last_name, avatar_url, phone } = body;

    // Preparar dados para atualização
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

    // Atualizar perfil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single();

    if (profileError) {
      console.error('Error updating profile:', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Atualizar user_metadata no Auth
    const newMetadata: Record<string, any> = { ...user.user_metadata };
    if (name) newMetadata.name = name;
    if (phone) newMetadata.phone = phone;

    await supabase.auth.updateUser({
      data: newMetadata
    });

    // Se é um agente, atualizar também na tabela agents
    if (user.user_metadata?.is_agent && user.user_metadata?.agent_id) {
      await supabase
        .from('agents')
        .update({ 
          name: name || `${updateData.first_name || ''} ${updateData.last_name || ''}`.trim(),
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
