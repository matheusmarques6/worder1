import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getAuthClient } from '@/lib/api-utils';
import { requestMeta, jwtSessionId } from '@/lib/settings/request-meta';
import { gotrue } from '@/lib/settings/gotrue';
export const dynamic = 'force-dynamic';

// Cookie temporário entre a senha e o código do 2FA (10 min).
const MFA_PENDING_COOKIE = 'sb-mfa-pending';
// Sinaliza ao middleware que a organização exige 2FA e o usuário ainda não configurou.
const MFA_SETUP_COOKIE = 'wd-2fa-required';

function cookieOpts(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge, path: '/' };
}

/** Registra tentativa de login (Configurações → Segurança → Histórico). */
async function logLogin(supabase: SupabaseClient, request: NextRequest, email: string, userId: string | null, success: boolean, reason?: string) {
  try {
    const m = requestMeta(request);
    await supabase.from('auth_login_events').insert({ user_id: userId, email, ip: m.ip, user_agent: m.userAgent, city: m.city, country: m.country, success, reason: reason || null });
  } catch { /* nunca bloqueia o login */ }
}

/** Guarda a sessão (navegador/IP) para a lista "Sessões ativas". */
async function trackSession(supabase: SupabaseClient, request: NextRequest, userId: string, orgId: string | null, accessToken: string) {
  try {
    const m = requestMeta(request);
    const sid = jwtSessionId(accessToken);
    if (!sid) return;
    await supabase.from('user_sessions').upsert({ user_id: userId, organization_id: orgId, auth_session_id: sid, user_agent: m.userAgent, ip: m.ip, city: m.city, country: m.country, last_seen_at: new Date().toISOString() }, { onConflict: 'auth_session_id' });
  } catch { /* best-effort */ }
}

function setSessionCookies(response: NextResponse, session: { access_token: string; refresh_token: string }) {
  response.cookies.set('sb-access-token', session.access_token, cookieOpts(60 * 60 * 24 * 7));
  response.cookies.set('sb-refresh-token', session.refresh_token, cookieOpts(60 * 60 * 24 * 30));
  response.cookies.delete(MFA_PENDING_COOKIE);
}

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
        return await handleLogin(client, data, request);
      case 'mfa-verify':
        return await handleMfaVerify(client, data, request);
      case 'signup':
        return await handleSignup(client, data);
      case 'logout':
        return await handleLogout(client, data, request);
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

async function handleLogin(supabase: SupabaseClient, { email, password }: { email: string; password: string }, request: NextRequest) {
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
    // Quem é o dono do e-mail (para o histórico dele mostrar a tentativa bloqueada).
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle();
    await logLogin(supabase, request, email, prof?.id || null, false, error.message);
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

  // ---- Verificação em duas etapas ----
  const { data: factors } = await supabase.rpc('list_mfa_factors', { p_user_id: data.user.id });
  const hasMfa = ((factors as any[]) || []).some((f) => f.status === 'verified');
  if (hasMfa) {
    // Senha certa, falta o código: guardamos a sessão aal1 num cookie curto.
    const response = NextResponse.json({ mfaRequired: true });
    response.cookies.set(MFA_PENDING_COOKIE, JSON.stringify({ a: data.session.access_token, r: data.session.refresh_token }), cookieOpts(60 * 10));
    return response;
  }

  const requires2fa = !!profile?.organization?.settings?.require_2fa && profile?.role !== 'owner';
  const response = NextResponse.json({
    user: data.user,
    profile,
    session: data.session,
    mfaSetupRequired: requires2fa,
  });
  setSessionCookies(response, data.session);
  if (requires2fa) response.cookies.set(MFA_SETUP_COOKIE, '1', cookieOpts(60 * 60 * 24 * 7));
  else response.cookies.delete(MFA_SETUP_COOKIE);
  await logLogin(supabase, request, email, data.user.id, true);
  await trackSession(supabase, request, data.user.id, profile?.organization_id || null, data.session.access_token);
  return response;
}

// Segunda etapa do login: código do app autenticador.
async function handleMfaVerify(supabase: SupabaseClient, { code }: { code: string }, request: NextRequest) {
  const raw = request.cookies.get(MFA_PENDING_COOKIE)?.value;
  if (!raw) return NextResponse.json({ error: 'Sessão expirada. Entre novamente com e-mail e senha.' }, { status: 401 });
  let pending: { a: string; r: string };
  try { pending = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 }); }
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return NextResponse.json({ error: 'Digite o código de 6 dígitos.' }, { status: 400 });

  const { data: { user }, error: uErr } = await supabase.auth.getUser(pending.a);
  if (uErr || !user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  const { data: factors } = await supabase.rpc('list_mfa_factors', { p_user_id: user.id });
  const totp = ((factors as any[]) || []).filter((f) => f.status === 'verified' && f.factor_type === 'totp');
  if (!totp.length) return NextResponse.json({ error: 'Nenhum app autenticador configurado.' }, { status: 400 });

  let verified: any = null;
  for (const f of totp) {
    try {
      const ch = await gotrue.challenge(pending.a, f.id);
      verified = await gotrue.verify(pending.a, f.id, ch.id, clean);
      break;
    } catch { /* tenta o próximo fator */ }
  }
  if (!verified?.access_token) {
    await logLogin(supabase, request, user.email || '', user.id, false, 'Código 2FA inválido');
    return NextResponse.json({ error: 'Código inválido ou expirado. Tente o próximo código do app.' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('*, organization:organizations(*)').eq('id', user.id).single();
  const response = NextResponse.json({ user, profile, session: { access_token: verified.access_token, refresh_token: verified.refresh_token } });
  setSessionCookies(response, { access_token: verified.access_token, refresh_token: verified.refresh_token });
  response.cookies.delete(MFA_SETUP_COOKIE);
  await logLogin(supabase, request, user.email || '', user.id, true, '2FA');
  await trackSession(supabase, request, user.id, profile?.organization_id || null, verified.access_token);
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

async function handleLogout(supabase: SupabaseClient, { accessToken }: { accessToken?: string }, request?: NextRequest) {
  const token = accessToken || request?.cookies.get('sb-access-token')?.value;
  if (token && token !== 'dev-access-token') {
    try {
      const sid = jwtSessionId(token);
      if (sid) await supabase.from('user_sessions').update({ revoked_at: new Date().toISOString() }).eq('auth_session_id', sid);
      await supabase.auth.admin.signOut(token);
    } catch (e) {
      // Ignore errors during logout
    }
  }

  const response = NextResponse.json({ success: true });

  // Clear cookies
  response.cookies.delete('sb-access-token');
  response.cookies.delete('sb-refresh-token');
  response.cookies.delete(MFA_PENDING_COOKIE);
  response.cookies.delete(MFA_SETUP_COOKIE);

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
