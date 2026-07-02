import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getAuthClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// Lazy initialize Supabase client
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (url && key && !url.includes('placeholder')) {
      supabase = createClient(url, key);
    }
  }
  return supabase;
}

// Dev mode ONLY in local development (never in production)
const isDevMode = process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true';

// Login
export async function POST(request: NextRequest) {
  const { action, ...data } = await request.json();

  // ---- Rate limit anti brute-force (apenas ações sensíveis) ----
  if (action === 'login' || action === 'signup' || action === 'reset-password') {
    const ip = getClientIp(request);
    const emailKey = (data?.email || '').toString().toLowerCase();
    // Janela 60s: até 10 tentativas por IP e 5 por email/IP.
    const ipLimit = await checkRateLimit(`auth:${action}:ip:${ip}`, {
      limit: 10,
      windowSec: 60,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde e tente novamente.' },
        { status: 429 }
      );
    }
    if (emailKey) {
      const emailLimit = await checkRateLimit(`auth:${action}:email:${emailKey}`, {
        limit: 5,
        windowSec: 60,
      });
      if (!emailLimit.allowed) {
        return NextResponse.json(
          { error: 'Muitas tentativas para esta conta. Aguarde alguns segundos.' },
          { status: 429 }
        );
      }
    }
  }

  try {
    const client = getSupabase();

    // If Supabase is not configured and we're in dev mode, allow bypass
    if (!client) {
      if (isDevMode && action === 'login') {
        return handleDevLogin(data);
      }
      if (action === 'get-or-create-org') {
        // Return a default organization for development
        return NextResponse.json({
          organization: { id: 'default-org', name: 'Development Organization' },
          user: {
            id: 'default-user',
            email: 'demo@worder.com',
            first_name: 'Demo',
            last_name: 'User',
          },
        });
      }
      return NextResponse.json(
        { error: 'Database not configured. Please set up Supabase environment variables.' },
        { status: 503 }
      );
    }

    switch (action) {
      case 'login':
        return await handleLogin(client, data);
      case 'signup':
        return await handleSignup(client, data);
      case 'logout':
        return await handleLogout(client, data);
      case 'reset-password':
        return await handleResetPassword(client, data);
      case 'update-password':
        return await handleUpdatePassword(client, data);
      case 'get-or-create-org':
        return await handleGetOrCreateOrg(client, request);
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

// Dev mode login - bypasses real authentication
function handleDevLogin({ email, password }: { email: string; password: string }) {
  console.log('[DEV MODE] Bypassing authentication for:', email);
  
  const response = NextResponse.json({
    user: {
      id: 'dev-user-id',
      email,
      created_at: new Date().toISOString(),
    },
    profile: {
      id: 'dev-user-id',
      email,
      first_name: 'Dev',
      last_name: 'User',
      role: 'owner',
    },
    session: {
      access_token: 'dev-access-token',
      refresh_token: 'dev-refresh-token',
    },
    devMode: true,
  });

  // Set dev auth cookies
  response.cookies.set('sb-access-token', 'dev-access-token', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  response.cookies.set('sb-refresh-token', 'dev-refresh-token', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}

async function handleLogin(supabase: SupabaseClient, { email, password }: { email: string; password: string }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // If auth fails and we're in dev mode, allow bypass
    if (isDevMode) {
      console.log('[DEV MODE] Auth failed, using bypass:', error.message);
      return handleDevLogin({ email, password });
    }
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Get user profile and organization
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      *,
      organization:organizations(*)
    `)
    .eq('id', data.user.id)
    .single();

  const response = NextResponse.json({
    user: data.user,
    profile,
    session: data.session,
  });

  // Set auth cookie
  response.cookies.set('sb-access-token', data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  response.cookies.set('sb-refresh-token', data.session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}

async function handleSignup(
  supabase: SupabaseClient,
  {
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
  }
) {
  // Create auth user with metadata
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

  // The trigger handle_new_user() in the database will automatically create
  // the organization, profile, and default pipeline

  const response = NextResponse.json({
    user: authData.user,
    session: authData.session,
    message: 'Conta criada com sucesso!',
  });

  // If session exists, set auth cookies (auto-login)
  if (authData.session) {
    response.cookies.set('sb-access-token', authData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    });

    response.cookies.set('sb-refresh-token', authData.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
  }

  return response;
}

async function handleLogout(supabase: SupabaseClient, { accessToken }: { accessToken?: string }) {
  if (accessToken && accessToken !== 'dev-access-token') {
    try {
      await supabase.auth.admin.signOut(accessToken);
    } catch (e) {
      // Ignore errors during logout
    }
  }

  const response = NextResponse.json({ success: true });

  // Clear cookies
  response.cookies.delete('sb-access-token');
  response.cookies.delete('sb-refresh-token');

  return response;
}

async function handleResetPassword(supabase: SupabaseClient, { email }: { email: string }) {
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

async function handleUpdatePassword(
  supabase: SupabaseClient,
  {
    newPassword,
  }: {
    accessToken?: string;
    newPassword: string;
  }
) {
  // ⚠️ SEGURANÇA: identidade vem SEMPRE da sessão. Qualquer id de
  // usuário enviado no body é ignorado — só é permitido alterar a
  // própria senha do usuário autenticado (evita account takeover).
  const auth = await getAuthClient();
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!newPassword) {
    return NextResponse.json({ error: 'newPassword is required' }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.updateUserById(auth.user.id, {
    password: newPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ message: 'Password updated successfully' });
}

// Get or create default organization
async function handleGetOrCreateOrg(supabase: SupabaseClient, request: NextRequest) {
  try {
    // IMPORTANT: Read the access token from cookies to get authenticated user
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (accessToken) {
      // Try to get user with the token
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(accessToken);
      
      if (authUser && !authError) {
        // User is authenticated - return their real data
        const { data: profile } = await supabase
          .from('profiles')
          .select('*, organization:organizations(*)')
          .eq('id', authUser.id)
          .single();

        // ✅ CORREÇÃO: Não usar 'default-org' - usar null se não tiver organization
        const orgId = profile?.organization?.id || profile?.organization_id || authUser.user_metadata?.organization_id || null;

        return NextResponse.json({
          organization: profile?.organization || (orgId ? { id: orgId } : null),
          user: {
            id: authUser.id,
            email: authUser.email,
            name: profile?.first_name && profile?.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : authUser.user_metadata?.name || profile?.first_name || 'User',
            first_name: profile?.first_name || authUser.user_metadata?.name?.split(' ')[0],
            last_name: profile?.last_name || '',
            avatar_url: profile?.avatar_url || authUser.user_metadata?.avatar_url,
            role: profile?.role || 'user',
            organization_id: orgId,
            user_metadata: authUser.user_metadata,
          },
        });
      }
    }

    // No authenticated user — return empty (must login first)
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  } catch (error: any) {
    console.error('Error in handleGetOrCreateOrg:', error);
    // ✅ CORREÇÃO: Retornar erro em vez de ID inválido
    return NextResponse.json(
      { error: 'Error getting or creating organization', details: error?.message },
      { status: 500 }
    );
  }
}

// GET - Get current user
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Dev mode check
  if (accessToken === 'dev-access-token') {
    return NextResponse.json({
      user: {
        id: 'dev-user-id',
        email: 'dev@worder.com',
      },
      profile: {
        id: 'dev-user-id',
        email: 'dev@worder.com',
        first_name: 'Dev',
        last_name: 'User',
        role: 'owner',
      },
      devMode: true,
    });
  }

  const client = getSupabase();
  if (!client) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  const { data: { user }, error } = await client.auth.getUser(accessToken);

  if (error || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // Get profile and organization
  const { data: profile } = await client
    .from('profiles')
    .select(`
      *,
      organization:organizations(*)
    `)
    .eq('id', user.id)
    .single();

  return NextResponse.json({ user, profile });
}
