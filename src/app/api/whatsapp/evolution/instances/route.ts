// =============================================
// API: Evolution - Instances
// src/app/api/whatsapp/evolution/instances/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createEvolutionClient } from '@/lib/whatsapp/evolution-api';
import { nanoid } from 'nanoid';

// =============================================
// GET - Listar instâncias
// =============================================
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Buscar instâncias
    const { data: instances, error } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Verificar status de cada instância
    const instancesWithStatus = await Promise.all(
      (instances || []).map(async (instance) => {
        try {
          const client = createEvolutionClient({
            serverUrl: instance.server_url,
            apiKey: instance.api_key,
            instanceName: instance.instance_name,
          });
          
          const state = await client.getConnectionState();
          
          // Atualizar status se mudou
          if (state.state !== instance.status) {
            await supabase
              .from('evolution_instances')
              .update({ status: state.connected ? 'connected' : 'disconnected' })
              .eq('id', instance.id);
          }

          return {
            ...instance,
            status: state.connected ? 'connected' : 'disconnected',
            access_token: undefined, // Não expor
            api_key: undefined, // Não expor
          };
        } catch {
          return {
            ...instance,
            status: 'error',
            access_token: undefined,
            api_key: undefined,
          };
        }
      })
    );

    return NextResponse.json({ instances: instancesWithStatus });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// POST - Criar instância
// =============================================
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const { serverUrl, apiKey, instanceName } = body;

    // Usar URL e Key padrão se não fornecidos
    const finalServerUrl = serverUrl || process.env.EVOLUTION_API_URL;
    const finalApiKey = apiKey || process.env.EVOLUTION_API_KEY;
    const finalInstanceName = instanceName || `worder-${nanoid(8)}`;

    if (!finalServerUrl || !finalApiKey) {
      return NextResponse.json({ 
        error: 'Server URL and API Key required (or set EVOLUTION_API_URL and EVOLUTION_API_KEY env vars)' 
      }, { status: 400 });
    }

    // Verificar se já existe
    const { data: existing } = await supabase
      .from('evolution_instances')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('instance_name', finalInstanceName)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Instance name already exists' }, { status: 409 });
    }

    // Criar instância na Evolution API
    const client = createEvolutionClient({
      serverUrl: finalServerUrl,
      apiKey: finalApiKey,
      instanceName: finalInstanceName,
    });

    let createResult;
    try {
      createResult = await client.createInstance({ qrcode: true });
    } catch (apiError: any) {
      // Se já existe na Evolution, tentar conectar
      if (apiError.status === 403 || apiError.message?.includes('exists')) {
        // Instance já existe, continuar
      } else {
        return NextResponse.json({ 
          error: 'Failed to create instance: ' + apiError.message 
        }, { status: 400 });
      }
    }

    // Salvar no banco
    const { data: instance, error: insertError } = await supabase
      .from('evolution_instances')
      .insert({
        organization_id: profile.organization_id,
        instance_name: finalInstanceName,
        instance_id: createResult?.instance?.instanceId,
        server_url: finalServerUrl,
        api_key: finalApiKey,
        status: 'disconnected',
        webhook_configured: false,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save instance' }, { status: 500 });
    }

    // Configurar webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/evolution/webhook`;
    try {
      await client.setWebhook(webhookUrl);
      await supabase
        .from('evolution_instances')
        .update({ webhook_url: webhookUrl, webhook_configured: true })
        .eq('id', instance.id);
    } catch (webhookError) {
      console.warn('Failed to configure webhook:', webhookError);
    }

    // Obter QR Code
    let qrcode;
    try {
      const connectResult = await client.connect();
      qrcode = connectResult.qrcode;
    } catch {
      // Ignore
    }

    return NextResponse.json({
      success: true,
      instance: {
        id: instance.id,
        instanceName: instance.instance_name,
        status: instance.status,
      },
      qrcode,
      webhookUrl,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// PATCH - Ações na instância (connect, logout, etc)
// =============================================
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const { instanceId, action } = body;

    if (!instanceId || !action) {
      return NextResponse.json({ error: 'instanceId and action required' }, { status: 400 });
    }

    // Buscar instância
    const { data: instance } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('id', instanceId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    const client = createEvolutionClient({
      serverUrl: instance.server_url,
      apiKey: instance.api_key,
      instanceName: instance.instance_name,
    });

    let result: any = {};

    switch (action) {
      case 'connect':
        const connectResult = await client.connect();
        result = connectResult;
        if (connectResult.qrcode) {
          await supabase
            .from('evolution_instances')
            .update({ 
              qr_code: connectResult.qrcode,
              qr_expires_at: new Date(Date.now() + 60000).toISOString(),
              status: 'qr_pending',
            })
            .eq('id', instance.id);
        }
        break;

      case 'logout':
        await client.logout();
        await supabase
          .from('evolution_instances')
          .update({ 
            status: 'disconnected',
            phone_number: null,
            owner_jid: null,
            qr_code: null,
          })
          .eq('id', instance.id);
        result = { success: true };
        break;

      case 'restart':
        await client.restart();
        result = { success: true };
        break;

      case 'status':
        const state = await client.getConnectionState();
        result = state;
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// =============================================
// DELETE - Deletar instância
// =============================================
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('id');

    if (!instanceId) {
      return NextResponse.json({ error: 'Instance ID required' }, { status: 400 });
    }

    // Buscar instância
    const { data: instance } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('id', instanceId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    // Deletar na Evolution API
    try {
      const client = createEvolutionClient({
        serverUrl: instance.server_url,
        apiKey: instance.api_key,
        instanceName: instance.instance_name,
      });
      await client.deleteInstance();
    } catch {
      // Continuar mesmo se falhar
    }

    // Deletar do banco
    await supabase
      .from('evolution_instances')
      .delete()
      .eq('id', instanceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
