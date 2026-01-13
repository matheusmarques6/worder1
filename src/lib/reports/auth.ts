import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

/**
 * Resultado da validação de acesso
 */
export interface ReportAccessResult {
  authorized: boolean
  userId?: string
  organizationId?: string
  error?: string
}

/**
 * Valida se o usuário tem acesso ao relatório
 * 
 * Regras:
 * - Usuário deve estar autenticado
 * - Se storeId fornecido, deve pertencer à organização do usuário
 * - Nunca confiar apenas no query param
 */
export async function validateReportAccess(
  storeId?: string | null
): Promise<ReportAccessResult> {
  try {
    const supabase = createServerComponentClient({ cookies })
    
    // 1. Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return {
        authorized: false,
        error: 'Usuário não autenticado',
      }
    }

    // 2. Buscar perfil do usuário com organização
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, organization_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return {
        authorized: false,
        error: 'Perfil não encontrado',
      }
    }

    // 3. Se storeId fornecido, verificar se pertence à organização
    if (storeId) {
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id, organization_id')
        .eq('id', storeId)
        .single()

      if (storeError || !store) {
        return {
          authorized: false,
          error: 'Loja não encontrada',
        }
      }

      if (store.organization_id !== profile.organization_id) {
        return {
          authorized: false,
          error: 'Acesso negado a esta loja',
        }
      }
    }

    return {
      authorized: true,
      userId: user.id,
      organizationId: profile.organization_id,
    }
  } catch (error) {
    console.error('[REPORT_AUTH_ERROR]', error)
    return {
      authorized: false,
      error: 'Erro ao validar acesso',
    }
  }
}

/**
 * Busca o ID da primeira loja do usuário (se nenhuma especificada)
 */
export async function getDefaultStoreId(organizationId: string): Promise<string | null> {
  try {
    const supabase = createServerComponentClient({ cookies })
    
    const { data: stores } = await supabase
      .from('stores')
      .select('id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(1)

    return stores?.[0]?.id || null
  } catch {
    return null
  }
}

/**
 * Extrai e valida parâmetros de período da URL
 */
export function parseReportParams(searchParams: URLSearchParams): {
  storeId: string | null
  period: string
  startDate: Date | null
  endDate: Date | null
} {
  const storeId = searchParams.get('storeId')
  const period = searchParams.get('period') || '30d'
  const startDateStr = searchParams.get('startDate')
  const endDateStr = searchParams.get('endDate')

  let startDate: Date | null = null
  let endDate: Date | null = null

  if (startDateStr) {
    const parsed = new Date(startDateStr)
    if (!isNaN(parsed.getTime())) startDate = parsed
  }

  if (endDateStr) {
    const parsed = new Date(endDateStr)
    if (!isNaN(parsed.getTime())) endDate = parsed
  }

  return { storeId, period, startDate, endDate }
}
