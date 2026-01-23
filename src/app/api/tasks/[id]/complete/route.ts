// =============================================
// API: Complete Task
// src/app/api/tasks/[id]/complete/route.ts
// POST - Marcar tarefa como concluída
// =============================================
// ⚠️ SEGURANÇA: OBRIGATÓRIO validar organization_id
// NUNCA permitir acesso a dados de outra organização
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      organization_id, // ⚠️ OBRIGATÓRIO
      completed_by,
      completed_by_name,
      outcome,
      outcome_type,
    } = body;

    // ⚠️ CRÍTICO: organization_id é OBRIGATÓRIO para isolamento de dados
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Buscar tarefa FILTRADA por organization_id
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('tasks')
      .select('id, organization_id, status')
      .eq('id', params.id)
      .eq('organization_id', organization_id) // ⚠️ CRÍTICO
      .single();

    if (fetchError || !existing) {
      // Não revelar se existe em outra org - apenas "não encontrada"
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }

    // Verificação adicional de segurança
    if (existing.organization_id !== organization_id) {
      console.error(`[SECURITY VIOLATION] Task ${params.id} access denied for org ${organization_id}`);
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    if (existing.status === 'completed') {
      return NextResponse.json({ error: 'Tarefa já está concluída' }, { status: 400 });
    }

    // ⚠️ SEGURANÇA: Update SEMPRE com filtro de organization_id
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by,
        completed_by_name,
        outcome,
        outcome_type,
      })
      .eq('id', params.id)
      .eq('organization_id', organization_id) // ⚠️ CRÍTICO
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone_number),
        deal:deals(id, title, value)
      `)
      .single();

    if (error) throw error;

    console.log('[Task COMPLETE] Completed:', params.id, 'Org:', organization_id);

    return NextResponse.json({
      task: data,
      success: true,
    });
  } catch (error: any) {
    console.error('[Task Complete] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
