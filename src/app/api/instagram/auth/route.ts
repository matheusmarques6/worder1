import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

const META_APP_ID = process.env.META_APP_ID!
const META_APP_SECRET = process.env.META_APP_SECRET!
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Generate state token for security
    const stateToken = randomBytes(32).toString('hex')

    // Store state token temporarily (in a more robust system, use Redis or DB)
    const stateData = {
      user_id: user.id,
      organization_id: membership.organization_id,
      created_at: new Date().toISOString(),
    }

    // Store in DB for verification
    await supabase.from('oauth_states').upsert({
      state_token: stateToken,
      data: stateData,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
    })

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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { code, state } = body

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
    }

    // Verify state token
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state_token', state)
      .single()

    if (stateError || !stateData) {
      return NextResponse.json({ error: 'Invalid state token' }, { status: 400 })
    }

    // Check expiry
    if (new Date(stateData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'State token expired' }, { status: 400 })
    }

    // Delete used state token
    await supabase.from('oauth_states').delete().eq('state_token', state)

    const organizationId = stateData.data.organization_id

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
