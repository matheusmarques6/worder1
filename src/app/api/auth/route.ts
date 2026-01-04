import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Admin client para operações que precisam de SERVICE_ROLE
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (url && key) {
    return createClient(url, key);
  }
  return null;
}

// Login
export async function POST(request: NextRequest) {
  const { action, ...data } = await request.json();

  try {
    switch (action) {
      case 'login':
        return await handleLogin(data);
      case 'signup':
        return await handleSignup(data);
      case 'logout':
        return await handleLogout();
      case 'reset-password':
        return await handleResetPassword(data);
      case 'get-or-create-org':
        return await handleGetOrCreateOrg();
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 500 }
    );
  }
}

async function handleLogin({ email, password }: { email: string; password: string }) {
  // ✅ Usar createSupabaseServerClient para que cookies sejam setados automaticamente
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('[Auth] Login error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Buscar profile com organization
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      *,
      organization:organizations(*)
    `)
    .eq('id', data.user.id)
    .single();

  console.log('[Auth] Login successful:', email);

  // ✅ Cookies são setados automaticamente pelo createSupabaseServerClient
  // NÃO precisamos setar manualmente!
  return NextResponse.json({
    user: data.user,
    profile,
    success: true,
  });
}

async function handleSignup({
  email,
  password,
  firstName,
  lastName,
  companyName,
}: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName?: string;
}) {
  const supabase = createSupabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        company_name: companyName,
      },
    },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  console.log('[Auth] Signup successful:', email);

  // ✅ NÃO retornar session - cookies já foram setados automaticamente
  return NextResponse.json({
    success: true,
    message: 'Conta criada com sucesso!',
    userId: authData.user.id,
    email: authData.user.email,
  });
}

async function handleLogout() {
  const supabase = createSupabaseServerClient();
  
  await supabase.auth.signOut();

  console.log('[Auth] Logout successful');

  return NextResponse.json({ success: true });
}

async function handleResetPassword({ email }: { email: string }) {
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    message: 'Password reset email sent. Please check your inbox.',
  });
}

async function handleGetOrCreateOrg() {
  const supabase = createSupabaseServerClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Buscar profile com organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organization:organizations(*)')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    organization: profile?.organization || null,
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || profile?.first_name || 'User',
      first_name: profile?.first_name || user.user_metadata?.name?.split(' ')[0],
      last_name: profile?.last_name || '',
      role: profile?.role || 'user',
      organization_id: profile?.organization_id,
    },
  });
}

// GET - Get current user
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Buscar profile com organization
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      *,
      organization:organizations(*)
    `)
    .eq('id', user.id)
    .single();

  return NextResponse.json({ 
    user, 
    profile,
    organizationId: profile?.organization_id 
  });
}
