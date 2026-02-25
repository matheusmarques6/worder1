import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List Instagram accounts for organization
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

    const { data: accounts, error } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching Instagram accounts:', error)
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
    }

    // Don't expose sensitive tokens
    const safeAccounts = (accounts || []).map(account => ({
      ...account,
      access_token: undefined,
      webhook_verify_token: undefined,
    }))

    return NextResponse.json({ accounts: safeAccounts })
  } catch (error) {
    console.error('Instagram accounts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Disconnect an Instagram account
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get('account_id')

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
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

    // Verify account belongs to organization
    const { data: account } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Update account status to disconnected (soft delete)
    const { error } = await supabase
      .from('instagram_accounts')
      .update({
        status: 'disconnected',
        access_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)

    if (error) {
      console.error('Error disconnecting Instagram account:', error)
      return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 })
    }

    // Update installed_integrations status
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('slug', 'instagram-direct')
      .single()

    if (integration) {
      await supabase
        .from('installed_integrations')
        .update({ status: 'disconnected' })
        .eq('organization_id', membership.organization_id)
        .eq('integration_id', integration.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Instagram disconnect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update Instagram account settings
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { account_id, ...updates } = body

    if (!account_id) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
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

    // Verify account belongs to organization
    const { data: account } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('id', account_id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Allowed updates
    const allowedUpdates: any = {}
    if ('status' in updates) allowedUpdates.status = updates.status
    if ('store_id' in updates) allowedUpdates.store_id = updates.store_id

    allowedUpdates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('instagram_accounts')
      .update(allowedUpdates)
      .eq('id', account_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating Instagram account:', error)
      return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
    }

    return NextResponse.json({
      account: {
        ...data,
        access_token: undefined,
        webhook_verify_token: undefined,
      }
    })
  } catch (error) {
    console.error('Instagram account update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
