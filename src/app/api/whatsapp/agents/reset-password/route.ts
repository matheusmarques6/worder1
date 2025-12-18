import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// Admin client para resetar senhas
function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !serviceKey) return null;
  
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
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
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { agent_id, organization_id, organizationId } = body;
    const orgId = organization_id || organizationId;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    // Buscar agente
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, user_id, type, email')
      .eq('id', agent_id)
      .eq('organization_id', orgId)
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

    // Get admin client
    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ 
        error: 'Server configuration incomplete. SUPABASE_SERVICE_ROLE_KEY not defined.' 
      }, { status: 500 });
    }

    // Gerar nova senha
    const newPassword = generateStrongPassword(12);

    // Atualizar senha no Auth
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

    // Marcar que usuário deve trocar a senha
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
