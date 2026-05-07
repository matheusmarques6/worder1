// =============================================
// /api/automations/variables/custom
//
// CRUD for merchant-defined named variable shortcuts. Lets the
// flow builder picker show "Customer Full Name" instead of forcing
// every template author to know the path is
// trigger.raw.customer.first_name.
//
// GET    — list all custom variables for the org
// POST   — create  { variable_key, label, path, ...optional }
// PATCH  — update  { id, ...fields }
// DELETE — { id }
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['string', 'number', 'currency', 'date', 'datetime', 'boolean', 'array', 'object'];

function normalizeKey(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export async function GET(_request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('custom_variables')
    .select('*')
    .eq('organization_id', orgId)
    .order('category', { ascending: true })
    .order('label', { ascending: true });
  return NextResponse.json({ variables: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const variable_key = normalizeKey(body?.variable_key || body?.label);
  if (!variable_key) {
    return NextResponse.json({ error: 'variable_key (or label) required' }, { status: 400 });
  }
  if (!body?.path || typeof body.path !== 'string') {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }

  const variable_type = body.variable_type && VALID_TYPES.includes(body.variable_type)
    ? body.variable_type
    : 'string';

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('custom_variables')
    .insert({
      organization_id: orgId,
      store_id: body.store_id || null,
      variable_key,
      label: body.label || variable_key,
      description: body.description || null,
      category: body.category || 'custom',
      variable_type,
      path: String(body.path).trim(),
      fallback_path: body.fallback_path || null,
      default_value: body.default_value || null,
      applicable_triggers: Array.isArray(body.applicable_triggers) ? body.applicable_triggers : null,
      enabled: body.enabled !== false,
      created_by: auth.user.id || null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma variável com essa chave' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ variable: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const allowed = ['label', 'description', 'category', 'variable_type', 'path', 'fallback_path', 'default_value', 'applicable_triggers', 'enabled'];
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (updates.variable_type && !VALID_TYPES.includes(updates.variable_type)) {
    return NextResponse.json({ error: 'variable_type inválido' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('custom_variables')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ variable: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('custom_variables')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
