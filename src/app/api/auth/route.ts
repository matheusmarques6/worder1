import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// Check if we should use dev mode (bypass auth)
const isDevMode = process.env.NODE_ENV === 'development' || process.env.DEV_AUTH_BYPASS === 'true';

// Login
export async function POST(request: NextRequest) {
  const { action, ...data } = await request.json();

  try {
    const client = getSupabase();
    
    // If Supabase is not configured and we're in dev mode, allow bypass
    if (!client) {
      if (isDevMode && action === 'login') {
        return handleDevLogin(data);
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
    accessToken,
    newPassword,
  }: {
    accessToken: string;
    newPassword: string;
  }
) {
  const { error } = await supabase.auth.admin.updateUserById(accessToken, {
    password: newPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ message: 'Password updated successfully' });
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
