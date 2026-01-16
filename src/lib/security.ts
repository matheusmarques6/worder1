// =============================================
// Security Helper: Organization Validation
// CRÍTICO: Garante isolamento de dados entre organizações
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Valida se o usuário tem acesso à organização especificada
 * SEMPRE use esta função antes de qualquer operação com dados
 */
export async function validateOrganizationAccess(
  userId: string | null | undefined,
  organizationId: string | null | undefined
): Promise<{ valid: boolean; error?: string }> {
  if (!userId) {
    return { valid: false, error: 'Usuário não autenticado' };
  }

  if (!organizationId) {
    return { valid: false, error: 'organization_id é obrigatório' };
  }

  try {
    // Verificar se o usuário pertence à organização
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return { valid: false, error: 'Perfil não encontrado' };
    }

    if (profile.organization_id !== organizationId) {
      console.error(`[SECURITY] User ${userId} tried to access org ${organizationId} but belongs to ${profile.organization_id}`);
      return { valid: false, error: 'Acesso negado a esta organização' };
    }

    return { valid: true };
  } catch (err: any) {
    console.error('[SECURITY] Validation error:', err);
    return { valid: false, error: 'Erro na validação de acesso' };
  }
}

/**
 * Busca a organização do usuário autenticado
 */
export async function getUserOrganization(
  userId: string | null | undefined
): Promise<{ organizationId: string | null; error?: string }> {
  if (!userId) {
    return { organizationId: null, error: 'Usuário não autenticado' };
  }

  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return { organizationId: null, error: 'Perfil não encontrado' };
    }

    return { organizationId: profile.organization_id };
  } catch (err: any) {
    return { organizationId: null, error: err.message };
  }
}

/**
 * Valida se um recurso pertence à organização do usuário
 * Use para validar acesso a recursos específicos (tasks, tickets, etc)
 */
export async function validateResourceAccess(
  table: string,
  resourceId: string,
  userOrganizationId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('organization_id')
      .eq('id', resourceId)
      .single();

    if (error || !data) {
      return { valid: false, error: 'Recurso não encontrado' };
    }

    if (data.organization_id !== userOrganizationId) {
      console.error(`[SECURITY] Access denied to ${table}/${resourceId} for org ${userOrganizationId}`);
      return { valid: false, error: 'Acesso negado a este recurso' };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/**
 * Wrapper para queries seguras - SEMPRE filtra por organization_id
 */
export function secureQuery(
  query: any,
  organizationId: string
) {
  return query.eq('organization_id', organizationId);
}
