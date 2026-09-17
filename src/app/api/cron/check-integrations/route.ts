// =============================================
// Cron Job: Verificar Integrações
// src/app/api/cron/check-integrations/route.ts
// =============================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { IntegrationHealthService, IntegrationType } from '@/lib/services/integration-health';
import { authorizeCronRequest } from '@/lib/cron-auth';

export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    console.log('❌ Autorização negada');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('🔄 Cron job iniciado:', new Date().toISOString());
  
  const startTime = Date.now();
  
  try {
    const healthService = new IntegrationHealthService();
    const results = await healthService.checkAllIntegrations();
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Cron job concluído em ${duration}ms:`, {
      total: results.total,
      healthy: results.healthy,
      unhealthy: results.unhealthy,
    });
    
    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ...results,
    });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Cron job error:', message);
    
    return NextResponse.json({
      success: false,
      error: message,
      duration: `${Date.now() - startTime}ms`,
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, integrationId } = body as {
      type?: string;
      integrationId?: string;
    };
    
    if (!type || !integrationId) {
      return NextResponse.json(
        { error: 'type and integrationId required' },
        { status: 400 }
      );
    }
    
    console.log(`🔍 Verificação manual: ${type}:${integrationId}`);
    
    const healthService = new IntegrationHealthService();
    const result = await healthService.checkIntegration(type as IntegrationType, integrationId);
    
    return NextResponse.json({
      success: result.success,
      status: result.status,
      statusCode: result.statusCode,
      message: result.message,
      responseTimeMs: result.responseTimeMs,
      notified: result.shouldNotify,
    });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Manual check error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
