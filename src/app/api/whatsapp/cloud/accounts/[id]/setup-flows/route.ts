// =============================================
// API: WhatsApp Cloud — Setup Flow Encryption Keys
// src/app/api/whatsapp/cloud/accounts/[id]/setup-flows/route.ts
//
// POST: Generate RSA key pair, encrypt private key, upload public to Meta, store in DB
// GET:  Check if flow keys are configured (boolean, never expose keys)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateRsaKeyPair } from '@/lib/whatsapp/flows-encryption';
import { encryptToken, decryptToken } from '@/lib/whatsapp/token-encryption';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// =============================================
// AUTH HELPER — same pattern as accounts/route.ts
// =============================================

async function authenticateAndGetAccount(
  request: NextRequest,
  accountId: string,
) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }

  // Fetch user profile to get organization_id
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Organization not found' }, { status: 404 }) };
  }

  // Verify user owns this account (org-scoped)
  const { data: account, error: accountError } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .select('id, waba_id, phone_number_id, access_token_encrypted, flow_public_key_pem, flow_private_key_encrypted, flow_key_uploaded_at')
    .eq('id', accountId)
    .eq('organization_id', profile.organization_id)
    .eq('status', 'active')
    .single();

  if (accountError || !account) {
    return { error: NextResponse.json({ error: 'Account not found' }, { status: 404 }) };
  }

  return { account, organizationId: profile.organization_id };
}

// =============================================
// GET — Check if flow keys are configured
// =============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authenticateAndGetAccount(request, id);

    if ('error' in auth) return auth.error;

    const { account } = auth;

    return NextResponse.json({
      configured: !!(account.flow_public_key_pem && account.flow_private_key_encrypted),
      uploaded_at: account.flow_key_uploaded_at || null,
    });
  } catch (error) {
    console.error('[setup-flows] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// POST — Generate key pair, upload public key, store encrypted private key
// =============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authenticateAndGetAccount(request, id);

    if ('error' in auth) return auth.error;

    const { account } = auth;

    // 409 if keys already exist
    if (account.flow_public_key_pem && account.flow_private_key_encrypted) {
      return NextResponse.json(
        { error: 'Flow encryption keys already configured. Delete existing keys first to regenerate.' },
        { status: 409 },
      );
    }

    // Verify the account has an access token
    if (!account.access_token_encrypted) {
      return NextResponse.json(
        { error: 'Account access token not configured' },
        { status: 400 },
      );
    }

    // 1. Generate RSA key pair
    const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();

    // 2. Encrypt private key for at-rest storage (NEVER log it)
    const privateKeyEncrypted = encryptToken(privateKeyPem);

    // 3. Upload public key to Meta via Cloud API
    const accessToken = decryptToken(account.access_token_encrypted);
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken,
      wabaId: account.waba_id,
    });

    try {
      // Upload to the WABA (account-level encryption key for all flows)
      await client.uploadFlowEncryptionKey(account.waba_id, publicKeyPem);
    } catch (metaError: any) {
      console.error('[setup-flows] Failed to upload public key to Meta:', metaError.message);
      return NextResponse.json(
        { error: 'Failed to upload encryption key to Meta: ' + (metaError.message || 'Unknown error') },
        { status: 502 },
      );
    }

    // 4. Store in database
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .update({
        flow_public_key_pem: publicKeyPem,
        flow_private_key_encrypted: privateKeyEncrypted,
        flow_key_uploaded_at: now,
      })
      .eq('id', account.id);

    if (updateError) {
      console.error('[setup-flows] Failed to store keys in DB:', updateError.message);
      return NextResponse.json(
        { error: 'Keys generated and uploaded to Meta but failed to store in database' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      configured: true,
      uploaded_at: now,
    });
  } catch (error) {
    console.error('[setup-flows] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
