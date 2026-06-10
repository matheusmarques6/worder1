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
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // ✅ P1 v2: org do token; organizationId da query é IGNORADO
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const organizationId = auth.orgId

  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId') || undefined
    const segment = searchParams.get('segment')

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
  // ✅ P1 v2: org do token; organizationId da query é IGNORADO
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const organizationId = auth.orgId

  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId') || undefined

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
