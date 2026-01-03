import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Admin client para resetar senhas (PRECISA service role key)
function getAdminClient() {
  return getSupabaseAdmin();
}

// Gerar senha forte aleatória
function generateStrongPassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=';
  
  const allChars = uppercase + lowercase + numbers + special;
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// POST - Reset password
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const body = await request.json();
    const { agent_id } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    // Buscar agente - RLS filtra automaticamente
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, user_id, type, email')
      .eq('id', agent_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.type !== 'human') {
      return NextResponse.json({ error: 'Cannot reset password for AI agents' }, { status: 400 });
    }

    if (!agent.user_id) {
      return NextResponse.json({ error: 'Agent does not have an associated user account' }, { status: 400 });
    }

    // Get admin client para operação de auth
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ 
        error: 'Server configuration incomplete. SUPABASE_SERVICE_ROLE_KEY not defined.' 
      }, { status: 500 });
    }

    // Gerar nova senha
    const newPassword = generateStrongPassword(12);

    // Atualizar senha no Auth - PRECISA admin client
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      agent.user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json({ 
        error: `Failed to reset password: ${updateError.message}` 
      }, { status: 500 });
    }

    // Marcar que usuário deve trocar a senha - RLS filtra
    await supabase
      .from('profiles')
      .update({ 
        must_change_password: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', agent.user_id);

    return NextResponse.json({ 
      success: true,
      temporary_password: newPassword,
      message: 'Password reset successfully. The agent will be required to change it on next login.'
    });

  } catch (error: any) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
