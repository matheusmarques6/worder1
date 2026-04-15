// =============================================
// WORDER: Recovery Items API
// /src/app/api/recovery/route.ts
//
// GET: fetch recovery_items by type with stats.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') || 'cart';
    const storeId = searchParams.get('store_id');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch recovery items with try/catch for missing table
    try {
      let query = supabaseAdmin
        .from('recovery_items')
        .select('*, contacts(id, email, first_name, last_name)', { count: 'exact' })
        .eq('organization_id', user.organization_id)
        .eq('type', type)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (storeId) {
        query = query.eq('store_id', storeId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data: items, count, error } = await query;

      if (error) {
        // Table might not exist or column missing
        if (error.message?.includes('relation') || error.code === '42P01' || error.code === '42703') {
          return NextResponse.json({
            items: [],
            total: 0,
            stats: { total: 0, pending: 0, sent: 0, recovered: 0, expired: 0 },
          });
        }
        console.error('[Recovery] Error fetching items:', error);
        return NextResponse.json({ error: 'Failed to fetch recovery items' }, { status: 500 });
      }

      // Calculate stats
      let stats = { total: 0, pending: 0, sent: 0, recovered: 0, expired: 0 };
      try {
        const { data: allItems } = await supabaseAdmin
          .from('recovery_items')
          .select('status')
          .eq('organization_id', user.organization_id)
          .eq('type', type);

        if (allItems) {
          stats.total = allItems.length;
          stats.pending = allItems.filter((i) => i.status === 'pending').length;
          stats.sent = allItems.filter((i) => i.status === 'sent').length;
          stats.recovered = allItems.filter((i) => i.status === 'recovered').length;
          stats.expired = allItems.filter((i) => i.status === 'expired').length;
        }
      } catch (statsError) {
        console.error('[Recovery] Error calculating stats:', statsError);
      }

      // Calculate revenue recovered
      let revenueRecovered = 0;
      try {
        const { data: recoveredItems } = await supabaseAdmin
          .from('recovery_items')
          .select('value')
          .eq('organization_id', user.organization_id)
          .eq('type', type)
          .eq('status', 'recovered');

        if (recoveredItems) {
          revenueRecovered = recoveredItems.reduce(
            (sum, item) => sum + (parseFloat(item.value) || 0),
            0
          );
        }
      } catch {
        // ignore
      }

      return NextResponse.json({
        items: items || [],
        total: count || 0,
        stats: {
          ...stats,
          revenue_recovered: revenueRecovered,
          recovery_rate:
            stats.total > 0
              ? ((stats.recovered / stats.total) * 100).toFixed(1)
              : '0.0',
        },
      });
    } catch (tableError: any) {
      // Table doesn't exist - return empty
      console.warn('[Recovery] Table may not exist:', tableError.message);
      return NextResponse.json({
        items: [],
        total: 0,
        stats: { total: 0, pending: 0, sent: 0, recovered: 0, expired: 0 },
      });
    }
  } catch (error) {
    console.error('[Recovery] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
