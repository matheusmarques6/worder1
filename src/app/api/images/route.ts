import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { data, error } = await supabaseAdmin
      .from('uploaded_images')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      // Table may not exist
      return NextResponse.json([])
    }

    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json([])
  }
}
