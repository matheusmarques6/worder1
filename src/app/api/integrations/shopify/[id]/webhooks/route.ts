// =============================================
// Shopify Webhooks Status API
// src/app/api/integrations/shopify/[id]/webhooks/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
  }

  try {
    // Get store info
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Get webhook stats from automation logs
    const { data: logs } = await supabase
      .from('automation_logs')
      .select('event_type, created_at')
      .eq('organization_id', organizationId)
      .eq('source_type', 'shopify')
      .order('created_at', { ascending: false })
      .limit(500)

    // Calculate webhook stats
    const webhookTopics = [
      'orders/create',
      'orders/paid',
      'orders/fulfilled',
      'orders/cancelled',
      'customers/create',
      'checkouts/create',
    ]

    const webhookMap: Record<string, { topic: string; status: string; lastReceived?: string; totalReceived: number }> = {}

    // Initialize all webhooks
    webhookTopics.forEach(topic => {
      const eventType = topic.replace('/', '_')
      webhookMap[eventType] = {
        topic,
        status: 'active',
        totalReceived: 0,
      }
    })

    // Count logs by event type
    if (logs) {
      logs.forEach(log => {
        const eventType = log.event_type
        if (webhookMap[eventType]) {
          webhookMap[eventType].totalReceived++
          if (!webhookMap[eventType].lastReceived) {
            webhookMap[eventType].lastReceived = log.created_at
          }
        }
      })
    }

    // Convert to array
    const webhooks = Object.values(webhookMap)

    return NextResponse.json({ webhooks })
  } catch (error: any) {
    console.error('Error fetching webhook status:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
