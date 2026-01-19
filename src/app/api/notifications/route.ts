// =============================================
// API: Notificações - VERSÃO ROBUSTA
// src/app/api/notifications/route.ts
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Helper para pegar organização do usuário
async function getOrganizationId(request: NextRequest): Promise<string | null> {
  try {
    // Tentar pegar do query param
    const { searchParams } = new URL(request.url);
    const orgIdFromQuery = searchParams.get('organizationId');
    if (orgIdFromQuery) return orgIdFromQuery;

    // Tentar pegar do usuário autenticado
    const supabaseClient = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (user) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      
      return profile?.organization_id || null;
    }

    return null;
  } catch (error) {
    console.error('Error getting organization:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getOrganizationId(request);
    
    if (!organizationId) {
      // Retornar array vazio se não tiver organização (não falhar)
      return NextResponse.json({
        notifications: [],
        unreadCount: 0,
      });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    
    // Verificar se tabela existe primeiro
    const { data: tableCheck, error: tableError } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .limit(1);

    // Se tabela não existe, retornar vazio
    if (tableError && tableError.code === '42P01') {
      console.log('Tabela notifications não existe, retornando vazio');
      return NextResponse.json({
        notifications: [],
        unreadCount: 0,
      });
    }

    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (unreadOnly) {
      query = query.eq('read', false);
    }
    
    const [notificationsResult, countResult] = await Promise.all([
      query,
      supabaseAdmin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('read', false)
    ]);
    
    if (notificationsResult.error) {
      console.error('Notifications query error:', notificationsResult.error);
      // Retornar vazio em caso de erro, não falhar
      return NextResponse.json({
        notifications: [],
        unreadCount: 0,
      });
    }
    
    return NextResponse.json({
      notifications: notificationsResult.data ?? [],
      unreadCount: countResult.count ?? 0,
    });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('List notifications error:', message);
    // Retornar vazio em caso de erro, não 500
    return NextResponse.json({
      notifications: [],
      unreadCount: 0,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const organizationId = await getOrganizationId(request);
    
    if (!organizationId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { notificationIds, markAllRead } = body as {
      notificationIds?: string[];
      markAllRead?: boolean;
    };
    
    const now = new Date().toISOString();
    
    if (markAllRead) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('organization_id', organizationId)
        .eq('read', false);
      
      if (error && error.code !== '42P01') {
        throw error;
      }
      
    } else if (notificationIds && notificationIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('organization_id', organizationId)
        .in('id', notificationIds);
      
      if (error && error.code !== '42P01') {
        throw error;
      }
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Mark read error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const organizationId = await getOrganizationId(request);
    
    if (!organizationId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleteAll = searchParams.get('deleteAll') === 'true';
    
    if (deleteAll) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .delete()
        .eq('organization_id', organizationId)
        .eq('read', true);
      
      if (error && error.code !== '42P01') {
        throw error;
      }
      
    } else if (id) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .delete()
        .eq('organization_id', organizationId)
        .eq('id', id);
      
      if (error && error.code !== '42P01') {
        throw error;
      }
      
    } else {
      return NextResponse.json(
        { error: 'id or deleteAll required' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Delete notification error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
