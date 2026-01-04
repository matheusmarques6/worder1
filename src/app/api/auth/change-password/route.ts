import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-route';

import { validatePassword } from '@/lib/password-validation';

// POST - Alterar senha do usuário
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    
    // Verificar usuário logado
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { current_password, new_password } = body;

    if (!current_password || !new_password) {
      return NextResponse.json({ 
        error: 'current_password and new_password are required' 
      }, { status: 400 });
    }

    // Validar força da nova senha
    const validation = validatePassword(new_password);
    if (!validation.isValid) {
      return NextResponse.json({ 
        error: 'A nova senha não atende aos requisitos de segurança',
        details: validation.errors
      }, { status: 400 });
    }

    // Verificar senha atual fazendo login novamente
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: current_password,
    });

    if (signInError) {
      return NextResponse.json({ 
        error: 'Senha atual incorreta' 
      }, { status: 400 });
    }

    // Atualizar para a nova senha
    const { error: updateError } = await supabase.auth.updateUser({
      password: new_password,
    });

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json({ 
        error: `Erro ao alterar senha: ${updateError.message}` 
      }, { status: 500 });
    }

    // Atualizar flag de must_change_password se existir
    await supabase
      .from('profiles')
      .update({ 
        must_change_password: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    return NextResponse.json({ 
      success: true,
      message: 'Senha alterada com sucesso' 
    });

  } catch (error: any) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
