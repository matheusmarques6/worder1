import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Helper para criar cliente SSR (login/signup)
function createSupabaseAuthClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.delete(name);
          } catch (error) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch {
              // Ignore
            }
          }
        },
      },
    }
  );
}

// Admin client para operações que precisam de SERVICE_ROLE
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (url && key) {
    return createClient(url, key);
  }
  return null;
}

// POST - Login, Signup, Logout
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

// GET - Check auth status
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAuthClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Buscar profile
    const { data: profile } = await supabase
      .from('profiles')
      .select(`*, organization:organizations(*)`)
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      user,
      profile,
      organizationId: profile?.organization_id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleLogin({ email, password }: { email: string; password: string }) {
  // Usar @supabase/ssr para que cookies sejam setados automaticamente
  const supabase = createSupabaseAuthClient();

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
    .select(`*, organization:organizations(*)`)
    .eq('id', data.user.id)
    .single();

  console.log('[Auth] Login successful:', email);

  // Cookies já foram setados automaticamente pelo @supabase/ssr
  return NextResponse.json({
    user: data.user,
    profile,
    organizationId: profile?.organization_id,
    success: true,
  });
}

async function handleSignup({ email, password, firstName, lastName, companyName }: any) {
  const supabase = createSupabaseAuthClient();
  const adminClient = getAdminClient();

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
    console.error('[Auth] Signup error:', authError.message);
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  // Criar organização e profile usando admin client
  if (adminClient) {
    // Criar organização
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .insert({
        name: companyName || `${firstName}'s Organization`,
        slug: `${email.split('@')[0]}-${authData.user.id.slice(0, 8)}`,
        plan: 'starter',
      })
      .select()
      .single();

    if (orgError) {
      console.error('[Auth] Org creation error:', orgError);
    }

    // Atualizar profile com organization_id
    if (org) {
      await adminClient
        .from('profiles')
        .update({
          organization_id: org.id,
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          role: 'owner',
        })
        .eq('id', authData.user.id);
    }
  }

  console.log('[Auth] Signup successful:', email);

  return NextResponse.json({
    success: true,
    message: 'Conta criada com sucesso!',
    userId: authData.user.id,
    email: authData.user.email,
  });
}

async function handleLogout() {
  const supabase = createSupabaseAuthClient();
  await supabase.auth.signOut();
  
  return NextResponse.json({ success: true, message: 'Logged out' });
}

async function handleResetPassword({ email }: { email: string }) {
  const supabase = createSupabaseAuthClient();
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ 
    success: true, 
    message: 'Email de recuperação enviado' 
  });
}

async function handleGetOrCreateOrg() {
  const supabase = createSupabaseAuthClient();
  const adminClient = getAdminClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Buscar profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organization:organizations(*)')
    .eq('id', user.id)
    .single();

  if (profile?.organization_id) {
    return NextResponse.json({
      organizationId: profile.organization_id,
      organization: profile.organization,
    });
  }

  // Criar nova organização
  if (adminClient) {
    const { data: org } = await adminClient
      .from('organizations')
      .insert({
        name: user.user_metadata?.company_name || `${user.email?.split('@')[0]}'s Org`,
        slug: `org-${user.id.slice(0, 8)}`,
        plan: 'starter',
      })
      .select()
      .single();

    if (org) {
      await adminClient
        .from('profiles')
        .update({ organization_id: org.id, role: 'owner' })
        .eq('id', user.id);

      return NextResponse.json({
        organizationId: org.id,
        organization: org,
      });
    }
  }

  return NextResponse.json({ error: 'Could not create organization' }, { status: 500 });
}
