// =============================================
// API: Notificações
// src/app/api/notifications/route.ts
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    
    // ✅ CORREÇÃO: Filtrar por organization_id explicitamente
    let query = supabase
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
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('read', false)
    ]);
    
    if (notificationsResult.error) throw notificationsResult.error;
    
    return NextResponse.json({
      notifications: notificationsResult.data ?? [],
      unreadCount: countResult.count ?? 0,
    });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('List notifications error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { notificationIds, markAllRead } = body as {
      notificationIds?: string[];
      markAllRead?: boolean;
    };
    
    const now = new Date().toISOString();
    
    if (markAllRead) {
      // ✅ CORREÇÃO: Filtrar por organization_id
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('organization_id', organizationId)
        .eq('read', false);
      
      if (error) throw error;
      
    } else if (notificationIds && notificationIds.length > 0) {
      // ✅ CORREÇÃO: Filtrar por organization_id
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('organization_id', organizationId)
        .in('id', notificationIds);
      
      if (error) throw error;
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Mark read error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleteAll = searchParams.get('deleteAll') === 'true';
    
    if (deleteAll) {
      // ✅ CORREÇÃO: Filtrar por organization_id
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('organization_id', organizationId)
        .eq('read', true);
      
      if (error) throw error;
      
    } else if (id) {
      // ✅ CORREÇÃO: Filtrar por organization_id
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('organization_id', organizationId)
        .eq('id', id);
      
      if (error) throw error;
      
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
