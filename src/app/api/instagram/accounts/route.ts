// =============================================
// API: Instagram Accounts Management
// src/app/api/instagram/accounts/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { createInstagramClient } from '@/lib/instagram/instagram-api';

export const dynamic = 'force-dynamic';

// GET - List Instagram accounts
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const { data: accounts, error } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Remove sensitive data
    const safeAccounts = (accounts || []).map(account => ({
      ...account,
      access_token: undefined,
      refresh_token: undefined,
    }));

    return NextResponse.json({ accounts: safeAccounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Add new Instagram account
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const body = await request.json();
    const { ig_user_id, access_token, store_id } = body;

    if (!ig_user_id || !access_token) {
      return NextResponse.json(
        { error: 'ig_user_id and access_token are required' },
        { status: 400 }
      );
    }

    // Verify token by fetching profile
    const client = createInstagramClient({
      igUserId: ig_user_id,
      accessToken: access_token,
    });

    let profile;
    try {
      profile = await client.getMyProfile();
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Invalid access token or Instagram User ID: ' + e.message },
        { status: 400 }
      );
    }

    // Check if account already exists
    const { data: existing } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('ig_user_id', ig_user_id)
      .single();

    if (existing) {
      // Update existing account
      const { data: updated, error } = await supabase
        .from('instagram_accounts')
        .update({
          access_token,
          username: profile.username,
          name: profile.name,
          profile_picture_url: profile.profile_picture_url,
          followers_count: profile.followers_count,
          media_count: profile.media_count,
          status: 'active',
          error_message: null,
          last_error_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        account: { ...updated, access_token: undefined },
        message: 'Account updated',
      });
    }

    // Create new account
    const { data: account, error } = await supabase
      .from('instagram_accounts')
      .insert({
        organization_id: organizationId,
        store_id: store_id || null,
        ig_user_id,
        access_token,
        username: profile.username,
        name: profile.name,
        profile_picture_url: profile.profile_picture_url,
        followers_count: profile.followers_count,
        media_count: profile.media_count,
        status: 'active',
        connected_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { account: { ...account, access_token: undefined }, message: 'Account connected' },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Remove Instagram account
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('instagram_accounts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
