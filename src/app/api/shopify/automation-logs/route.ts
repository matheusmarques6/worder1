// =============================================
// API: Shopify Automation Logs
// /api/shopify/automation-logs/route.ts
//
// GET - Listar logs de execução de automações
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// GET - Listar logs
// =============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const ruleId = searchParams.get('ruleId');
    const contactId = searchParams.get('contactId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseAdmin();
    
    let query = supabase
      .from('shopify_automation_logs')
      .select(`
        *,
        rule:shopify_transition_rules(id, rule_name, trigger_event),
        contact:contacts(id, name, email)
      `, { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (ruleId) {
      query = query.eq('rule_id', ruleId);
    }
    
    if (contactId) {
      query = query.eq('contact_id', contactId);
    }
    
    const { data: logs, error, count } = await query;
    
    if (error) {
      console.error('Error fetching automation logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch logs' },
        { status: 500 }
      );
    }
    
    // Calcular estatísticas
    const { data: stats } = await supabase
      .from('shopify_automation_logs')
      .select('action_taken, success')
      .eq('store_id', storeId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    const summary = {
      total24h: stats?.length || 0,
      success24h: stats?.filter(s => s.success).length || 0,
      failed24h: stats?.filter(s => !s.success).length || 0,
      byAction: {} as Record<string, number>,
    };
    
    stats?.forEach(s => {
      summary.byAction[s.action_taken] = (summary.byAction[s.action_taken] || 0) + 1;
    });
    
    return NextResponse.json({
      logs: logs || [],
      total: count || 0,
      limit,
      offset,
      summary,
    });
    
  } catch (error: any) {
    console.error('Error in GET /api/shopify/automation-logs:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
