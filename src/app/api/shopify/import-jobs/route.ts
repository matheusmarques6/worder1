// =============================================
// API: Shopify Import Jobs
// /src/app/api/shopify/import-jobs/route.ts
//
// Gerencia jobs de importação em background
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

function jsonResponse(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// =============================================
// GET: Buscar status do job ou listar jobs
// =============================================

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const storeId = searchParams.get('storeId');

    // Buscar job específico
    if (jobId) {
      const { data: job, error } = await supabase
        .from('shopify_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        return jsonResponse({ success: false, error: 'Job not found' }, 404);
      }

      // Calcular progresso
      const progress = job.total_customers > 0 
        ? Math.round((job.processed_count / job.total_customers) * 100) 
        : 0;

      return jsonResponse({
        success: true,
        job: {
          ...job,
          progress,
          estimatedTimeRemaining: calculateETA(job),
        },
      });
    }

    // Listar jobs da loja
    if (storeId) {
      const { data: jobs, error } = await supabase
        .from('shopify_import_jobs')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return jsonResponse({
        success: true,
        jobs: jobs || [],
      });
    }

    return jsonResponse({ success: false, error: 'jobId or storeId required' }, 400);

  } catch (error: any) {
    console.error('[ImportJobs] GET error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// =============================================
// POST: Criar novo job de importação
// =============================================

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const body = await request.json();
    const {
      storeId,
      contactType = 'auto',
      createDeals = false,
      pipelineId,
      stageId,
      tags = ['shopify', 'importado'],
      filterTags,
      filterEmailStatus,
    } = body;

    if (!storeId) {
      return jsonResponse({ success: false, error: 'storeId required' }, 400);
    }

    // Verificar se já existe job em andamento
    const { data: existingJob } = await supabase
      .from('shopify_import_jobs')
      .select('id, status')
      .eq('store_id', storeId)
      .in('status', ['pending', 'running', 'paused'])
      .single();

    if (existingJob) {
      return jsonResponse({
        success: false,
        error: 'Já existe uma importação em andamento',
        existingJobId: existingJob.id,
      }, 400);
    }

    // Buscar store
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('organization_id, shop_domain, access_token')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return jsonResponse({ success: false, error: 'Store not found' }, 404);
    }

    // Buscar contagem total de clientes
    const countResponse = await fetch(
      `https://${store.shop_domain}/admin/api/2024-10/customers/count.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    let totalCustomers = 0;
    if (countResponse.ok) {
      const countData = await countResponse.json();
      totalCustomers = countData.count || 0;
    }

    // Criar job
    const { data: job, error: jobError } = await supabase
      .from('shopify_import_jobs')
      .insert({
        organization_id: store.organization_id,
        store_id: storeId,
        status: 'pending',
        total_customers: totalCustomers,
        config: {
          contactType,
          createDeals,
          pipelineId: createDeals ? pipelineId : null,
          stageId: createDeals ? stageId : null,
          tags,
          filterTags: filterTags?.length > 0 ? filterTags : null,
          filterEmailStatus: filterEmailStatus?.length > 0 ? filterEmailStatus : null,
        },
      })
      .select()
      .single();

    if (jobError) {
      console.error('[ImportJobs] Error creating job:', jobError);
      return jsonResponse({ success: false, error: 'Erro ao criar job' }, 500);
    }

    console.log(`[ImportJobs] Created job ${job.id} for store ${storeId} with ${totalCustomers} customers`);

    return jsonResponse({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        totalCustomers,
      },
      message: 'Job criado com sucesso. O processamento iniciará em breve.',
    });

  } catch (error: any) {
    console.error('[ImportJobs] POST error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// =============================================
// DELETE: Cancelar job
// =============================================

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return jsonResponse({ success: false, error: 'jobId required' }, 400);
    }

    const { error } = await supabase
      .from('shopify_import_jobs')
      .update({ 
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['pending', 'running', 'paused']);

    if (error) throw error;

    return jsonResponse({
      success: true,
      message: 'Job cancelado com sucesso',
    });

  } catch (error: any) {
    console.error('[ImportJobs] DELETE error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// =============================================
// Helpers
// =============================================

function calculateETA(job: any): string | null {
  if (!job.started_at || job.processed_count === 0) return null;
  
  const elapsed = Date.now() - new Date(job.started_at).getTime();
  const rate = job.processed_count / (elapsed / 1000); // customers per second
  const remaining = job.total_customers - job.processed_count;
  const seconds = Math.round(remaining / rate);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}min`;
}
