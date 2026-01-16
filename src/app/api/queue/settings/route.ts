// =============================================
// API: Queue Settings
// src/app/api/queue/settings/route.ts
// GET - Buscar configurações
// PUT - Atualizar configurações
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// GET - Buscar configurações
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // Buscar ou criar configurações
    let { data: settings, error } = await supabaseAdmin
      .from('queue_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Não existe, criar com padrões
      const { data: newSettings, error: createError } = await supabaseAdmin
        .from('queue_settings')
        .insert({ organization_id: organizationId })
        .select()
        .single();

      if (createError) throw createError;
      settings = newSettings;
    } else if (error) {
      throw error;
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('[Queue Settings GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar configurações
// =============================================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      organization_id,
      distribution_method,
      max_conversations_per_agent,
      max_wait_time_minutes,
      business_hours,
      out_of_hours_message,
      queue_full_message,
      welcome_message,
      auto_assign_enabled,
      notify_on_new_conversation,
    } = body;

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
    }

    // Preparar updates
    const updates: Record<string, any> = {};

    if (distribution_method !== undefined) updates.distribution_method = distribution_method;
    if (max_conversations_per_agent !== undefined) updates.max_conversations_per_agent = max_conversations_per_agent;
    if (max_wait_time_minutes !== undefined) updates.max_wait_time_minutes = max_wait_time_minutes;
    if (business_hours !== undefined) updates.business_hours = business_hours;
    if (out_of_hours_message !== undefined) updates.out_of_hours_message = out_of_hours_message;
    if (queue_full_message !== undefined) updates.queue_full_message = queue_full_message;
    if (welcome_message !== undefined) updates.welcome_message = welcome_message;
    if (auto_assign_enabled !== undefined) updates.auto_assign_enabled = auto_assign_enabled;
    if (notify_on_new_conversation !== undefined) updates.notify_on_new_conversation = notify_on_new_conversation;

    // Upsert
    const { data: settings, error } = await supabaseAdmin
      .from('queue_settings')
      .upsert({
        organization_id,
        ...updates,
      }, {
        onConflict: 'organization_id',
      })
      .select()
      .single();

    if (error) throw error;

    console.log('[Queue Settings] Updated for org:', organization_id);

    return NextResponse.json({ settings, success: true });
  } catch (error: any) {
    console.error('[Queue Settings PUT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
