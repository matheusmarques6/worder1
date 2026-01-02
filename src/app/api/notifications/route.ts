// =============================================
// API: Notificações
// src/app/api/notifications/route.ts
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function getSupabaseClient() {
  return getSupabaseAdmin();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseClient();
    
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
  try {
    const body = await request.json();
    const { organizationId, notificationIds, markAllRead } = body as {
      organizationId?: string;
      notificationIds?: string[];
      markAllRead?: boolean;
    };
    
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    
    if (markAllRead) {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('organization_id', organizationId)
        .eq('read', false);
      
      if (error) throw error;
      
    } else if (notificationIds && notificationIds.length > 0) {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: now })
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
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const organizationId = searchParams.get('organizationId');
    const deleteAll = searchParams.get('deleteAll') === 'true';
    
    const supabase = getSupabaseClient();
    
    if (deleteAll && organizationId) {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('organization_id', organizationId)
        .eq('read', true);
      
      if (error) throw error;
      
    } else if (id) {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
    } else {
      return NextResponse.json(
        { error: 'id or (organizationId + deleteAll) required' },
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
