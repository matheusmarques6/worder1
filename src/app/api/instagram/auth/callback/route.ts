import { NextRequest, NextResponse } from 'next/server'

// This route handles the OAuth callback redirect from Facebook
// It captures the code and state, then redirects to the frontend
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  if (error) {
    // Redirect to frontend with error
    const redirectUrl = new URL('/integrations/instagram-direct', baseUrl)
    redirectUrl.searchParams.set('error', error)
    redirectUrl.searchParams.set('error_description', errorDescription || 'Unknown error')
    return NextResponse.redirect(redirectUrl)
  }

  if (!code || !state) {
    const redirectUrl = new URL('/integrations/instagram-direct', baseUrl)
    redirectUrl.searchParams.set('error', 'missing_params')
    redirectUrl.searchParams.set('error_description', 'Missing code or state parameter')
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect to frontend with code and state for processing
  const redirectUrl = new URL('/integrations/instagram-direct', baseUrl)
  redirectUrl.searchParams.set('code', code)
  redirectUrl.searchParams.set('state', state)

  return NextResponse.redirect(redirectUrl)
}
