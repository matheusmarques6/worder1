/**
 * OAUTH STATE SECURITY
 * 
 * Gerencia estados OAuth de forma segura para prevenir:
 * - CSRF attacks
 * - Account takeover
 * - Replay attacks
 * 
 * O state deve ser:
 * 1. Gerado pelo servidor (não pelo client)
 * 2. Associado a uma sessão/organização válida
 * 3. Com expiração curta (10 minutos)
 * 4. Usado apenas uma vez
 */

import { createHmac, randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ============================================
// TIPOS
// ============================================

export interface OAuthStateData {
  organizationId: string;
  userId: string;
  provider: 'meta' | 'tiktok' | 'google' | 'shopify';
  createdAt: number;
  nonce: string;
  storeId?: string; // Loja Shopify vinculada (para isolamento por loja)
}

// ============================================
// CONSTANTES
// ============================================

const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutos
const STATE_SECRET = process.env.OAUTH_STATE_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret-change-me';

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Gera um state OAuth seguro
 * 
 * @param organizationId - ID da organização
 * @param userId - ID do usuário que iniciou o fluxo
 * @param provider - Provider OAuth (meta, tiktok, etc)
 * @param storeId - ID da loja (opcional, para isolamento por loja)
 * @returns State codificado para uso na URL
 */
export function generateOAuthState(
  organizationId: string,
  userId: string,
  provider: OAuthStateData['provider'],
  storeId?: string
): string {
  const nonce = randomBytes(16).toString('hex');
  const createdAt = Date.now();
  
  const data: OAuthStateData = {
    organizationId,
    userId,
    provider,
    createdAt,
    nonce,
    storeId,
  };
  
  // Codificar dados
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  
  // Criar assinatura HMAC
  const signature = createHmac('sha256', STATE_SECRET)
    .update(payload)
    .digest('base64url');
  
  // Retornar state = payload.signature
  return `${payload}.${signature}`;
}

/**
 * Valida e decodifica um state OAuth
 * 
 * @param state - State recebido no callback
 * @param expectedProvider - Provider esperado
 * @returns Dados do state se válido, null se inválido
 */
export function validateOAuthState(
  state: string,
  expectedProvider: OAuthStateData['provider']
): OAuthStateData | null {
  try {
    // Separar payload e assinatura
    const parts = state.split('.');
    if (parts.length !== 2) {
      console.warn('[OAuth] State inválido: formato incorreto');
      return null;
    }
    
    const [payload, providedSignature] = parts;
    
    // Verificar assinatura
    const expectedSignature = createHmac('sha256', STATE_SECRET)
      .update(payload)
      .digest('base64url');
    
    if (providedSignature !== expectedSignature) {
      console.warn('[OAuth] State inválido: assinatura incorreta');
      return null;
    }
    
    // Decodificar payload
    const data: OAuthStateData = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );
    
    // Verificar provider
    if (data.provider !== expectedProvider) {
      console.warn(`[OAuth] State inválido: provider esperado ${expectedProvider}, recebido ${data.provider}`);
      return null;
    }
    
    // Verificar expiração
    const age = Date.now() - data.createdAt;
    if (age > STATE_EXPIRY_MS) {
      console.warn(`[OAuth] State expirado: ${Math.round(age / 1000)}s`);
      return null;
    }
    
    // Verificar campos obrigatórios
    if (!data.organizationId || !data.userId || !data.nonce) {
      console.warn('[OAuth] State inválido: campos ausentes');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('[OAuth] Erro ao validar state:', error);
    return null;
  }
}

/**
 * Verifica e invalida um state (uso único)
 * Armazena nonces usados para prevenir replay
 * 
 * @param state - State a verificar
 * @param expectedProvider - Provider esperado
 * @returns Dados do state se válido e não usado, null caso contrário
 */
export async function consumeOAuthState(
  state: string,
  expectedProvider: OAuthStateData['provider']
): Promise<OAuthStateData | null> {
  // Primeiro valida
  const data = validateOAuthState(state, expectedProvider);
  if (!data) return null;
  
  const supabase = getSupabaseAdmin();
  
  try {
    // O esquema de oauth_states é (state, provider, organization_id,
    // metadata, expires_at). As colunas `nonce`, `user_id` e `used_at`
    // NÃO existem: o select era recusado (e `.single()` sem erro
    // checado devolvia null, isto é, "nonce inédito") e o insert também
    // — ou seja, a proteção contra replay estava desligada, e o mesmo
    // state valia quantas vezes o atacante quisesse dentro dos 10min.
    const { data: existingState, error: readError } = await supabase
      .from('oauth_states')
      .select('id')
      .eq('state', data.nonce)
      .eq('provider', data.provider)
      .maybeSingle();

    if (readError) throw readError;

    if (existingState) {
      console.warn('[OAuth] State já utilizado (replay attack?)');
      return null;
    }

    // Marcar nonce como usado. Quem torna o uso único atômico é a
    // restrição única de `state` na tabela: duas requisições simultâneas
    // com o mesmo state — a corrida que o select acima não cobre —
    // fazem a segunda cair aqui com 23505.
    const { error: insertError } = await supabase.from('oauth_states').insert({
      state: data.nonce,
      provider: data.provider,
      organization_id: data.organizationId,
      metadata: {
        user_id: data.userId,
        store_id: data.storeId ?? null,
        used_at: new Date().toISOString(),
        kind: 'consumed_nonce',
      },
      expires_at: new Date(data.createdAt + STATE_EXPIRY_MS).toISOString(),
    });

    if (insertError) {
      if (insertError.code === '23505') {
        console.warn('[OAuth] State já utilizado (corrida de replay)');
        return null;
      }
      throw insertError;
    }

    return data;
  } catch (error) {
    // ✅ FAIL-CLOSED: se não conseguimos consultar/marcar o state (tabela
    // indisponível, erro de rede, etc.), REJEITAMOS o state. Retornar `data`
    // aqui abriria um buraco de replay: um atacante poderia reutilizar um
    // state válido sempre que o storage estivesse indisponível.
    console.error('[OAuth] Erro ao consumir state — rejeitando (fail-closed):', error);
    return null;
  }
}

/**
 * Limpa states expirados (rodar periodicamente)
 */
export async function cleanupExpiredStates(): Promise<number> {
  const supabase = getSupabaseAdmin();
  
  try {
    const { data, error } = await supabase
      .from('oauth_states')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select();
    
    return data?.length || 0;
  } catch {
    return 0;
  }
}

// ============================================
// HELPER PARA LOGS
// ============================================

export function logOAuthAttempt(
  provider: string,
  success: boolean,
  organizationId?: string,
  error?: string
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    provider,
    success,
    organizationId,
    error,
  };
  
  if (success) {
    console.log('[OAuth]', JSON.stringify(logData));
  } else {
    console.warn('[OAuth] FAILED:', JSON.stringify(logData));
  }
}
