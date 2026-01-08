import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import { encryptCredential, decryptCredential, maskSensitive } from '@/lib/automation/credential-encryption';
import { SupabaseClient } from '@supabase/supabase-js';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// ============================================
// CREDENTIAL TYPES
// ============================================

const CREDENTIAL_TYPES = [
  {
    type: 'whatsappBusiness',
    name: 'WhatsApp Business Cloud',
    icon: 'MessageSquare',
    fields: ['phoneNumberId', 'accessToken', 'webhookVerifyToken'],
  },
  {
    type: 'whatsappEvolution',
    name: 'WhatsApp Evolution API',
    icon: 'MessageSquare',
    fields: ['evolutionUrl', 'instanceName', 'apiKey'],
  },
  {
    type: 'shopifyOAuth2',
    name: 'Shopify',
    icon: 'ShoppingBag',
    fields: ['shopDomain', 'accessToken'],
  },
  {
    type: 'emailResend',
    name: 'Email (Resend)',
    icon: 'Mail',
    fields: ['apiKey', 'defaultFrom'],
  },
  {
    type: 'emailSendgrid',
    name: 'Email (SendGrid)',
    icon: 'Mail',
    fields: ['apiKey', 'defaultFrom'],
  },
  {
    type: 'emailSmtp',
    name: 'Email (SMTP)',
    icon: 'Mail',
    fields: ['host', 'port', 'username', 'password', 'secure'],
  },
  {
    type: 'klaviyo',
    name: 'Klaviyo',
    icon: 'Mail',
    fields: ['apiKey', 'publicKey'],
  },
  {
    type: 'httpBasicAuth',
    name: 'HTTP Basic Auth',
    icon: 'Key',
    fields: ['username', 'password'],
  },
  {
    type: 'httpBearerToken',
    name: 'HTTP Bearer Token',
    icon: 'Key',
    fields: ['token'],
  },
  {
    type: 'httpApiKey',
    name: 'HTTP API Key',
    icon: 'Key',
    fields: ['apiKey', 'headerName'],
  },
];

// ============================================
// GET - List credentials or get single
// ============================================

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const credentialId = searchParams.get('id');
  const type = searchParams.get('type');
  const includeTypes = searchParams.get('includeTypes') === 'true';

  try {
    // Return available credential types
    if (includeTypes) {
      // Also fetch credentials if no specific type requested
      let credentials: any[] = [];
      
      let query = supabase
        .from('credentials')
        .select('id, name, type, created_at, updated_at, last_used_at, last_test_success, automations_using')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data } = await query;
      credentials = data || [];

      return NextResponse.json({ 
        types: CREDENTIAL_TYPES,
        credentials,
      });
    }

    // Get single credential (without decrypted data)
    if (credentialId) {
      const { data, error } = await supabase
        .from('credentials')
        .select('id, name, type, created_at, updated_at, last_used_at, last_test_success, automations_using')
        .eq('id', credentialId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return NextResponse.json({ credential: data });
    }

    // List all credentials (filtered by type if provided)
    let query = supabase
      .from('credentials')
      .select('id, name, type, created_at, updated_at, last_used_at, last_test_success, automations_using')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ credentials: data || [] });

  } catch (error: any) {
    console.error('Credentials GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// POST - Create credential
// ============================================

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { name, type, data: credentialData } = body;

    if (!name || !type || !credentialData) {
      return NextResponse.json(
        { error: 'name, type and data are required' },
        { status: 400 }
      );
    }

    // Validate credential type
    const credType = CREDENTIAL_TYPES.find(t => t.type === type);
    if (!credType) {
      return NextResponse.json(
        { error: `Invalid credential type: ${type}` },
        { status: 400 }
      );
    }

    // Encrypt the credential data
    const encryptedData = encryptCredential(credentialData);

    // Insert credential
    const { data, error } = await supabase
      .from('credentials')
      .insert({
        organization_id: organizationId,
        name,
        type,
        encrypted_data: encryptedData,
        created_by: auth.user.id,
      })
      .select('id, name, type, created_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ credential: data }, { status: 201 });

  } catch (error: any) {
    console.error('Credentials POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// PUT - Update credential
// ============================================

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { id, name, data: credentialData } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name) {
      updates.name = name;
    }

    if (credentialData) {
      updates.encrypted_data = encryptCredential(credentialData);
    }

    const { data, error } = await supabase
      .from('credentials')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id, name, type, updated_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ credential: data });

  } catch (error: any) {
    console.error('Credentials PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// DELETE - Delete credential
// ============================================

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    // Check if credential is being used
    const { data: credential } = await supabase
      .from('credentials')
      .select('automations_using')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (credential && credential.automations_using && credential.automations_using.length > 0) {
      return NextResponse.json(
        { 
          error: 'Credential is being used by automations',
          automations: credential.automations_using,
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('credentials')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Credentials DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// PATCH - Test credential
// ============================================

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { id, action } = body;

    if (action !== 'test') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Get credential
    const { data: credential, error } = await supabase
      .from('credentials')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    // Decrypt and test
    const decrypted = decryptCredential(credential.encrypted_data);
    const testResult = await testCredential(credential.type, decrypted);

    // Update test status
    await supabase
      .from('credentials')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_success: testResult.success,
      })
      .eq('id', id);

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
    });

  } catch (error: any) {
    console.error('Credentials PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// TEST CREDENTIAL HELPER
// ============================================

async function testCredential(
  type: string,
  data: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  try {
    switch (type) {
      case 'whatsappBusiness': {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${data.phoneNumberId}`,
          {
            headers: { 'Authorization': `Bearer ${data.accessToken}` },
          }
        );
        if (!response.ok) {
          return { success: false, message: 'Token inválido ou expirado' };
        }
        return { success: true, message: 'Conexão bem sucedida!' };
      }

      case 'whatsappEvolution': {
        const response = await fetch(
          `${data.evolutionUrl}/instance/connectionState/${data.instanceName}`,
          {
            headers: { 'apikey': data.apiKey },
          }
        );
        if (!response.ok) {
          return { success: false, message: 'Falha ao conectar com Evolution API' };
        }
        const result = await response.json();
        return { 
          success: result.state === 'open', 
          message: result.state === 'open' ? 'WhatsApp conectado!' : 'WhatsApp desconectado',
        };
      }

      case 'emailResend': {
        const response = await fetch('https://api.resend.com/domains', {
          headers: { 'Authorization': `Bearer ${data.apiKey}` },
        });
        if (!response.ok) {
          return { success: false, message: 'API Key inválida' };
        }
        return { success: true, message: 'API Key válida!' };
      }

      case 'shopifyOAuth2': {
        const response = await fetch(
          `https://${data.shopDomain}/admin/api/2024-01/shop.json`,
          {
            headers: { 'X-Shopify-Access-Token': data.accessToken },
          }
        );
        if (!response.ok) {
          return { success: false, message: 'Token inválido ou loja não encontrada' };
        }
        return { success: true, message: 'Conexão com Shopify OK!' };
      }

      default:
        return { success: true, message: 'Credencial salva (não testada)' };
    }
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
