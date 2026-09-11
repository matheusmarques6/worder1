import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'
import { randomBytes } from 'crypto'

const META_APP_ID = process.env.META_APP_ID || ''
const META_APP_SECRET = process.env.META_APP_SECRET || ''
const META_API_VERSION = 'v19.0'

// Scopes needed for Instagram Messaging
const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'pages_manage_metadata',
  'pages_messaging',
  'pages_read_engagement',
  'pages_show_list',
  'business_management',
].join(',')

// GET - Generate OAuth URL
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organizationId = auth.user.organization_id

    // Generate state token for security
    const stateToken = randomBytes(32).toString('hex')

    // Store state token in DB. O esquema é (state, provider,
    // organization_id, metadata, expires_at) — com `state_token`/`data`
    // o PostgREST recusava a linha inteira, em silêncio: o state nunca
    // era gravado e a conexão com o Instagram SEMPRE respondia
    // "Invalid state token" no passo seguinte.
    const stateData = {
      organization_id: organizationId,
      user_id: auth.user.id,
      created_at: new Date().toISOString(),
    }

    const { error: stateError } = await supabase.from('oauth_states').insert({
      state: stateToken,
      provider: 'instagram',
      organization_id: organizationId,
      metadata: stateData,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
    })

    if (stateError) {
      console.error('Instagram auth: falha ao gravar o state:', stateError)
      return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const redirectUri = `${baseUrl}/api/instagram/auth/callback`

    const authUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`)
    authUrl.searchParams.set('client_id', META_APP_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', INSTAGRAM_SCOPES)
    authUrl.searchParams.set('state', stateToken)
    authUrl.searchParams.set('response_type', 'code')

    return NextResponse.json({
      url: authUrl.toString(),
      state: stateToken,
    })
  } catch (error) {
    console.error('Instagram auth error:', error)
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 })
  }
}

// POST - Exchange code for token and save account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, state } = body

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
    }

    // Verify state token
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('id, metadata, organization_id, expires_at')
      .eq('state', state)
      .eq('provider', 'instagram')
      .maybeSingle()

    if (stateError || !stateData) {
      return NextResponse.json({ error: 'Invalid state token' }, { status: 400 })
    }

    // Check expiry
    if (new Date(stateData.expires_at) < new Date()) {
      await supabase.from('oauth_states').delete().eq('id', stateData.id)
      return NextResponse.json({ error: 'State token expired' }, { status: 400 })
    }

    // Consumir o state ANTES da troca do código: uso único de verdade.
    const { data: consumed } = await supabase
      .from('oauth_states')
      .delete()
      .eq('id', stateData.id)
      .select('id')

    if (!consumed || consumed.length === 0) {
      // Outra requisição consumiu o mesmo state primeiro (replay).
      return NextResponse.json({ error: 'Invalid state token' }, { status: 400 })
    }

    const organizationId = stateData.organization_id || stateData.metadata?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'Invalid state token' }, { status: 400 })
    }

    // Exchange code for access token
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const redirectUri = `${baseUrl}/api/instagram/auth/callback`

    const tokenResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
      `client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${META_APP_SECRET}` +
      `&code=${code}`
    )

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error)
      return NextResponse.json({ error: tokenData.error.message }, { status: 400 })
    }

    const shortLivedToken = tokenData.access_token

    // Exchange for long-lived token
    const longLivedResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${META_APP_ID}` +
      `&client_secret=${META_APP_SECRET}` +
      `&fb_exchange_token=${shortLivedToken}`
    )

    const longLivedData = await longLivedResponse.json()
    const accessToken = longLivedData.access_token || shortLivedToken
    const expiresIn = longLivedData.expires_in || 3600

    // Get connected Facebook pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
    )

    const pagesData = await pagesResponse.json()

    if (!pagesData.data || pagesData.data.length === 0) {
      return NextResponse.json({
        error: 'No Facebook pages found. Please connect a Facebook page to your Instagram Business account.',
      }, { status: 400 })
    }

    // Find pages with Instagram Business accounts
    const pagesWithInstagram = pagesData.data.filter((page: any) => page.instagram_business_account)

    if (pagesWithInstagram.length === 0) {
      return NextResponse.json({
        error: 'No Instagram Business accounts found. Please link your Instagram Business account to a Facebook page.',
      }, { status: 400 })
    }

    // Return pages for user to select
    const accounts = await Promise.all(
      pagesWithInstagram.map(async (page: any) => {
        // Get Instagram account info
        const igResponse = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url,followers_count&access_token=${page.access_token}`
        )
        const igData = await igResponse.json()

        return {
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          instagram_business_id: page.instagram_business_account.id,
          instagram_username: igData.username,
          instagram_name: igData.name,
          instagram_profile_picture: igData.profile_picture_url,
          instagram_followers: igData.followers_count,
        }
      })
    )

    return NextResponse.json({
      accounts,
      organization_id: organizationId,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
  } catch (error) {
    console.error('Instagram auth POST error:', error)
    return NextResponse.json({ error: 'Failed to process auth' }, { status: 500 })
  }
}
