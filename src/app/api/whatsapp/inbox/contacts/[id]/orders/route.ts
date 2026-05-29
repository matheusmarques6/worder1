import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  // Placeholder - retorna vazio por enquanto
  return NextResponse.json({ orders: [], cart: null })
}
