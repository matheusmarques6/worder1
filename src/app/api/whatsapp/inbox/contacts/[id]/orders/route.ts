import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Placeholder - retorna vazio por enquanto
  return NextResponse.json({ orders: [], cart: null })
}
