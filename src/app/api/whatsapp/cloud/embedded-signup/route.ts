/**
 * WhatsApp Cloud — Embedded Signup callback.
 *
 * Called by the frontend (WhatsAppEmbeddedSignup.tsx) AFTER FB.login resolves
 * with both:
 *   - response.authResponse.code   (short-lived OAuth code)
 *   - WA_EMBEDDED_SIGNUP message   (phone_number_id, waba_id, business_id)
 *
 * Backend steps (all required before we can send/receive messages):
 *   1. Exchange code → long-lived business token (no expiration).
 *   2. POST /{WABA_ID}/subscribed_apps → register our app as webhook listener.
 *   3. POST /{PHONE_NUMBER_ID}/register → activate Cloud API messaging.
 *   4. Persist whatsapp_business_accounts row with token encrypted at-rest.
 *
 * Plan: Sprint 1 / Fase 3.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  exchangeEmbeddedSignupCode,
  subscribeAppToWABA,
  registerPhoneNumber,
  createWhatsAppCloudClient,
  WhatsAppCloudError,
} from '@/lib/whatsapp/cloud-api';
import { encryptToken } from '@/lib/whatsapp/token-encryption';
import { validateBusinessToken } from '@/lib/whatsapp/token-validation';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function nanoid(size = 32): string {
  return crypto.randomBytes(size).toString('hex').slice(0, size);
}

function generateRegistrationPin(): string {
  // Random 6-digit PIN. For accounts with 2FA enabled the merchant supplies
  // their own PIN through a different flow; this is the unblocked path.
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // B11: signup e operacao rara — 3/min por org. Tambem keyear por IP pra
    // bloquear bot fuzzing antes de chegar a Meta.
    const ip = getClientIp(request);
    for (const key of [
      `wa:cloud:signup:org:${profile.organization_id}`,
      `wa:cloud:signup:ip:${ip}`,
    ]) {
      const rl = await checkRateLimit(key, { limit: 3, windowSec: 60 });
      if (!rl.allowed) {
        const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
        return NextResponse.json(
          { error: 'rate_limited', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
      }
    }

    // Coexistence: the manual form path keeps working; Embedded Signup is
    // gated by feature flag per org while the rollout is in beta.
    const enabled = await isFeatureEnabled(profile.organization_id, 'whatsapp_embedded_signup');
    if (!enabled) {
      return NextResponse.json(
        { error: 'embedded_signup_disabled', hint: 'Use manual connection or enable feature_flags.whatsapp_embedded_signup' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { code, phone_number_id, waba_id, business_id } = body || {};

    if (!code || !phone_number_id || !waba_id) {
      return NextResponse.json(
        { error: 'code, phone_number_id and waba_id are required' },
        { status: 400 }
      );
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'server_misconfigured', detail: 'META_APP_ID / META_APP_SECRET not set' },
        { status: 500 }
      );
    }

    // Step 1 — code → long-lived business token
    let businessToken: string;
    try {
      const tokenResp = await exchangeEmbeddedSignupCode({
        appId,
        appSecret,
        code,
      });
      businessToken = tokenResp.access_token;
    } catch (err: any) {
      console.error('[embedded-signup] code exchange failed:', err);
      return NextResponse.json(
        { error: 'code_exchange_failed', detail: err?.message },
        { status: 400 }
      );
    }

    // Step 1.5 — validate token scopes/expiry BEFORE any Meta side-effects or
    // persistence. Without whatsapp_business_management the connection would be
    // saved as 'active' and fail later with error 190 (audit: MEDIUM gap #2).
    const validation = await validateBusinessToken({
      accessToken: businessToken,
      appId,
      appSecret,
    });
    if (!validation.valid) {
      console.error('[embedded-signup] token validation failed:', validation.error);
      return NextResponse.json(
        {
          error: 'token_validation_failed',
          detail:
            validation.error ||
            'Token retornado pela Meta sem as permissões necessárias. Refaça a conexão com o Facebook.',
        },
        { status: 400 }
      );
    }

    // Step 2 — subscribe our app to WABA (idempotent on Meta side)
    try {
      await subscribeAppToWABA({ wabaId: waba_id, accessToken: businessToken });
    } catch (err: any) {
      console.error('[embedded-signup] subscribe failed:', err);
      return NextResponse.json(
        { error: 'subscribe_failed', detail: err?.message },
        { status: 400 }
      );
    }

    // Step 3 — register the phone number for Cloud API messaging.
    // Some flows (BSP migration, coexistence) may already be registered;
    // ignore "already registered" failures.
    const pin = generateRegistrationPin();
    try {
      await registerPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: businessToken,
        pin,
      });
    } catch (err) {
      const isAlreadyRegistered =
        err instanceof WhatsAppCloudError &&
        /already.+registered|alread.+verified/i.test(err.message);
      if (!isAlreadyRegistered) {
        console.error('[embedded-signup] register_phone failed:', err);
        return NextResponse.json(
          { error: 'register_failed', detail: (err as Error)?.message },
          { status: 400 }
        );
      }
    }

    // Step 4 — fetch metadata and persist account with encrypted token
    const client = createWhatsAppCloudClient({
      phoneNumberId: phone_number_id,
      accessToken: businessToken,
      wabaId: waba_id,
    });

    let phoneInfo: { display_phone_number: string; verified_name: string; quality_rating: string };
    try {
      phoneInfo = await client.getPhoneNumber();
    } catch (err: any) {
      console.error('[embedded-signup] getPhoneNumber failed:', err);
      return NextResponse.json(
        { error: 'phone_info_failed', detail: err?.message },
        { status: 400 }
      );
    }

    const webhookVerifyToken = nanoid(32);

    const { data: account, error: insertError } = await supabase
      .from('whatsapp_business_accounts')
      .upsert(
        {
          organization_id: profile.organization_id,
          waba_id,
          phone_number_id,
          business_id: business_id || null,
          app_id: appId,
          phone_number: phoneInfo.display_phone_number.replace(/\D/g, ''),
          display_phone_number: phoneInfo.display_phone_number,
          verified_name: phoneInfo.verified_name,
          quality_rating: phoneInfo.quality_rating || 'UNKNOWN',
          access_token_encrypted: encryptToken(businessToken),
          webhook_verify_token: webhookVerifyToken,
          webhook_configured: true,
          status: 'active',
          account_mode: 'LIVE',
          connection_method: 'embedded_signup',
        },
        { onConflict: 'phone_number_id' }
      )
      .select()
      .single();

    if (insertError) {
      console.error('[embedded-signup] persist failed:', insertError);
      return NextResponse.json(
        { error: 'persist_failed', detail: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        phoneNumber: account.display_phone_number,
        verifiedName: account.verified_name,
        qualityRating: account.quality_rating,
        status: account.status,
      },
    });
  } catch (err) {
    console.error('[embedded-signup] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
