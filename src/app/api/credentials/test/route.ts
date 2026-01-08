import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { decryptCredential } from '@/lib/automation/credential-encryption';

// ============================================
// CREDENTIAL TEST HANDLERS
// ============================================

type TestFunction = (data: Record<string, any>) => Promise<{ success: boolean; error?: string; details?: any }>;

const credentialTesters: Record<string, TestFunction> = {
  // WhatsApp Business Cloud
  whatsappBusiness: async (data) => {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${data.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${data.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return { 
          success: false, 
          error: error.error?.message || 'Token inválido ou Phone Number ID incorreto',
        };
      }

      const result = await response.json();
      return { 
        success: true, 
        details: { phone_number: result.display_phone_number, verified: result.verified_name },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // WhatsApp Evolution API
  whatsappEvolution: async (data) => {
    try {
      const url = `${data.evolutionUrl.replace(/\/$/, '')}/instance/connectionState/${data.instanceName}`;
      const response = await fetch(url, {
        headers: {
          apikey: data.apiKey,
        },
      });

      if (!response.ok) {
        return { success: false, error: 'API Key inválida ou instância não encontrada' };
      }

      const result = await response.json();
      return { 
        success: true, 
        details: { state: result.state, instance: data.instanceName },
      };
    } catch (error: any) {
      return { success: false, error: `Falha na conexão: ${error.message}` };
    }
  },

  // Email Resend
  emailResend: async (data) => {
    try {
      const response = await fetch('https://api.resend.com/domains', {
        headers: {
          Authorization: `Bearer ${data.apiKey}`,
        },
      });

      if (!response.ok) {
        return { success: false, error: 'API Key inválida' };
      }

      const result = await response.json();
      return { 
        success: true, 
        details: { domains: result.data?.length || 0 },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Email SendGrid
  emailSendgrid: async (data) => {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
        headers: {
          Authorization: `Bearer ${data.apiKey}`,
        },
      });

      if (!response.ok) {
        return { success: false, error: 'API Key inválida' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Shopify
  shopifyOAuth2: async (data) => {
    try {
      const domain = data.shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const response = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': data.accessToken,
        },
      });

      if (!response.ok) {
        return { success: false, error: 'Token inválido ou domínio incorreto' };
      }

      const result = await response.json();
      return { 
        success: true, 
        details: { shop_name: result.shop?.name },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // HTTP Basic Auth - test with a simple request
  httpBasicAuth: async (data) => {
    // Can't really test without a URL, so just validate format
    if (!data.username || !data.password) {
      return { success: false, error: 'Usuário e senha são obrigatórios' };
    }
    return { success: true, details: { username: data.username } };
  },

  // HTTP API Key
  httpApiKey: async (data) => {
    if (!data.apiKey) {
      return { success: false, error: 'API Key é obrigatória' };
    }
    return { success: true };
  },

  // Webhook
  webhook: async (data) => {
    try {
      // Test if URL is reachable with HEAD request
      const response = await fetch(data.url, {
        method: 'HEAD',
      });

      // Even 4xx responses mean the server is reachable
      return { 
        success: true, 
        details: { url: data.url, status: response.status },
      };
    } catch (error: any) {
      return { success: false, error: `URL não acessível: ${error.message}` };
    }
  },

  // Database
  database: async (data) => {
    // Can't actually test DB connection from edge runtime
    // Just validate connection string format
    const connStr = data.connectionString || '';
    if (!connStr.match(/^(postgres|mysql|mongodb|redis):\/\//)) {
      return { success: false, error: 'Connection string inválida' };
    }
    return { success: true, details: { type: connStr.split('://')[0] } };
  },
};

// ============================================
// POST - Test credential
// ============================================

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const body = await request.json();
    const { credentialId } = body;

    if (!credentialId) {
      return NextResponse.json({ error: 'credentialId é obrigatório' }, { status: 400 });
    }

    // Buscar credencial - RLS filtra automaticamente
    const { data: credential, error: fetchError } = await supabase
      .from('credentials')
      .select('id, type, encrypted_data')
      .eq('id', credentialId)
      .single();

    if (fetchError || !credential) {
      return NextResponse.json({ error: 'Credencial não encontrada' }, { status: 404 });
    }

    // Decriptar dados
    let credentialData: Record<string, any>;
    try {
      credentialData = decryptCredential(credential.encrypted_data);
    } catch {
      return NextResponse.json({ 
        success: false, 
        error: 'Falha ao decriptar dados da credencial',
      });
    }

    // Encontrar tester apropriado
    const tester = credentialTesters[credential.type];
    if (!tester) {
      // Se não há tester específico, retorna sucesso (não podemos testar)
      return NextResponse.json({ 
        success: true, 
        details: { message: 'Tipo de credencial não possui teste automático' },
      });
    }

    // Executar teste
    const testResult = await tester(credentialData);

    // Atualizar status de teste no banco
    await supabase
      .from('credentials')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_success: testResult.success,
      })
      .eq('id', credentialId);

    return NextResponse.json(testResult);

  } catch (error: any) {
    console.error('Erro ao testar credencial:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
    }, { status: 500 });
  }
}
