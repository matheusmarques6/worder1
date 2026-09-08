// =============================================
// GET /api/public/geo
//
// O país do visitante para o gate de localização do popup. O runtime
// chamava ipapi.co direto do navegador: mandava o IP de cada visitante
// para um terceiro (LGPD), dependia de um free tier com limite, e
// somava uma viagem externa antes de decidir se o popup aparece.
//
// A borda já sabe o país — Vercel, Cloudflare e a maioria dos proxies
// carimbam o header. Devolvemos só isso: duas letras, nada de IP, nada de
// cidade. `private, no-store` porque a resposta é do visitante, não da
// URL.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { countryFromHeaders } from '@/lib/forms/consent'
import { publicCorsHeaders } from '@/lib/forms/public-cors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const country = countryFromHeaders(req.headers)
  return NextResponse.json(
    { country },
    {
      headers: {
        ...publicCorsHeaders(req.headers.get('origin')),
        'Cache-Control': 'private, no-store',
      },
    },
  )
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: publicCorsHeaders(req.headers.get('origin')) })
}
