import { NextRequest, NextResponse } from 'next/server'
import { GET as getPermissions, POST as writePermissions } from '../../permissions/route'
export const dynamic = 'force-dynamic'

// Legacy URL keeps its HTTP contract while sharing the same server authority.
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const url = request.nextUrl.clone()
  url.searchParams.set('agent_id', id)
  return getPermissions(new NextRequest(url, { headers: request.headers }))
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const body = await request.json().catch(() => ({}))
  const response = await writePermissions(new NextRequest(request.url, {
    method: 'POST', headers: request.headers, body: JSON.stringify({ ...body, agent_id: id }),
  }))
  if (!response.ok) return response
  return NextResponse.json({ ...(await response.json()), success: true })
}
