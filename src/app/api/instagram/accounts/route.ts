import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// GET - List Instagram accounts for organization
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get('organization_id')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    const { data: accounts, error } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('organization_id', organizationId)
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
    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get('account_id')
    const organizationId = searchParams.get('organization_id')

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    // Verify account belongs to organization
    const { data: account } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('organization_id', organizationId)
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
        .eq('organization_id', organizationId)
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
    const body = await request.json()
    const { account_id, organization_id, ...updates } = body

    if (!account_id) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    // Verify account belongs to organization
    const { data: account } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('id', account_id)
      .eq('organization_id', organization_id)
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
