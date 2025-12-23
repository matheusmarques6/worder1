// =============================================
// API: Integration Health Logs
// src/app/api/integrations/health/logs/route.ts
// =============================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface HealthLogRow {
  id: string;
  organization_id: string;
  integration_type: string;
  integration_id: string;
  integration_name: string | null;
  status: 'success' | 'warning' | 'error';
  status_code: string | null;
  message: string | null;
  response_time_ms: number | null;
  details: Record<string, unknown> | null;
  checked_at: string;
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const integrationType = searchParams.get('type');
    const integrationId = searchParams.get('integrationId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from('integration_health_logs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('checked_at', { ascending: false })
      .limit(limit);
    
    // Filtros opcionais
    if (integrationType) {
      query = query.eq('integration_type', integrationType);
    }
    
    if (integrationId) {
      query = query.eq('integration_id', integrationId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching health logs:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    const logs = (data as HealthLogRow[]).map(log => ({
      id: log.id,
      integration_type: log.integration_type,
      integration_id: log.integration_id,
      integration_name: log.integration_name,
      status: log.status,
      status_code: log.status_code,
      message: log.message,
      response_time_ms: log.response_time_ms,
      details: log.details,
      checked_at: log.checked_at,
    }));
    
    return NextResponse.json({ logs });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Health logs error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Endpoint para limpar logs antigos (opcional, para manutenção)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const daysOld = parseInt(searchParams.get('daysOld') || '30');
    
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseClient();
    
    // Calcular data limite
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const { error, count } = await supabase
      .from('integration_health_logs')
      .delete()
      .eq('organization_id', organizationId)
      .lt('checked_at', cutoffDate.toISOString())
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Error deleting old logs:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      deleted: count ?? 0,
      message: `Logs anteriores a ${daysOld} dias foram removidos`,
    });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Delete logs error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
