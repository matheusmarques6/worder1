// =============================================
// API: RFM Analysis
// GET /api/whatsapp/rfm (distribution)
// POST /api/whatsapp/rfm (calculate)
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import {
  getRFMDistribution,
  calculateRFM,
  getContactsBySegment,
  RFM_SEGMENTS,
} from '@/lib/services/whatsapp/rfm-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const storeId = searchParams.get('storeId') || undefined
    const segment = searchParams.get('segment')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    if (segment) {
      const result = await getContactsBySegment(
        organizationId,
        segment,
        storeId,
        parseInt(searchParams.get('limit') || '50'),
        parseInt(searchParams.get('offset') || '0')
      )
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 })
      }
      return NextResponse.json({ data: result.data })
    }

    const result = await getRFMDistribution(organizationId, storeId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      data: result.data,
      segments: RFM_SEGMENTS,
    })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const storeId = searchParams.get('storeId') || undefined

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const result = await calculateRFM(organizationId, storeId)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ data: result.data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
