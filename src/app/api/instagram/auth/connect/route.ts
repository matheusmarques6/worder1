import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'
import { randomBytes } from 'crypto'

const META_API_VERSION = 'v19.0'

// POST - Connect selected Instagram account
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organization_id = auth.user.organization_id

    const body = await request.json()
    const {
      store_id,
      page_id,
      page_access_token,
      instagram_business_id,
      instagram_username,
      instagram_name,
      instagram_profile_picture,
      instagram_followers,
      token_expires_at,
    } = body

    if (!page_id || !page_access_token || !instagram_business_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Generate webhook verify token
    const webhookVerifyToken = randomBytes(16).toString('hex')

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('instagram_business_id', instagram_business_id)
      .single()

    let accountId: string

    if (existingAccount) {
      // Update existing account
      const { data, error } = await supabase
        .from('instagram_accounts')
        .update({
          page_id,
          access_token: page_access_token,
          username: instagram_username,
          name: instagram_name,
          profile_picture_url: instagram_profile_picture,
          followers_count: instagram_followers,
          token_expires_at,
          status: 'active',
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating Instagram account:', error)
        return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
      }

      accountId = existingAccount.id
    } else {
      // Create new account
      const { data, error } = await supabase
        .from('instagram_accounts')
        .insert({
          organization_id,
          store_id: store_id || null,
          instagram_business_id,
          instagram_user_id: instagram_business_id,
          page_id,
          username: instagram_username,
          name: instagram_name,
          profile_picture_url: instagram_profile_picture,
          followers_count: instagram_followers,
          access_token: page_access_token,
          token_expires_at,
          webhook_verify_token: webhookVerifyToken,
          status: 'active',
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating Instagram account:', error)
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
      }

      accountId = data.id
    }

    // Subscribe to webhooks
    try {
      await subscribeToWebhook(page_id, page_access_token)
    } catch (webhookError) {
      console.error('Failed to subscribe to webhooks:', webhookError)
      // Don't fail the whole operation, just log the error
    }

    // Create or update installed_integrations record
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('slug', 'instagram-direct')
      .single()

    if (integration) {
      await supabase.from('installed_integrations').upsert({
        organization_id,
        store_id: store_id || null,
        integration_id: integration.id,
        status: 'active',
        configuration: {
          account_id: accountId,
          instagram_username,
          instagram_business_id,
        },
        last_sync_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,integration_id',
      })
    }

    return NextResponse.json({
      success: true,
      account_id: accountId,
      message: 'Instagram account connected successfully',
    })
  } catch (error) {
    console.error('Instagram connect error:', error)
    return NextResponse.json({ error: 'Failed to connect account' }, { status: 500 })
  }
}

async function subscribeToWebhook(pageId: string, accessToken: string) {
  // Subscribe the page to receive messaging webhooks
  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: accessToken,
        subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins', 'messaging_referrals'],
      }),
    }
  )

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error.message)
  }

  return data
}
