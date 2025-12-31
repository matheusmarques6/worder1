// =============================================
// Custom Fields API
// src/app/api/custom-fields/route.ts
//
// GET: Listar definições de campos
// POST: Criar nova definição
// PUT: Atualizar definição
// DELETE: Remover definição
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// =============================================
// GET - Listar campos personalizados
// =============================================
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const entityType = searchParams.get('entityType'); // 'contact', 'deal', 'company'
  
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }
  
  try {
    let query = supabase
      .from('custom_field_definitions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('position', { ascending: true });
    
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    
    const { data: fields, error } = await query;
    
    if (error) {
      console.error('[Custom Fields API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Agrupar por entity_type
    const grouped = (fields || []).reduce((acc: any, field) => {
      if (!acc[field.entity_type]) {
        acc[field.entity_type] = [];
      }
      acc[field.entity_type].push({
        id: field.id,
        key: field.field_key,
        label: field.field_name,
        type: field.field_type,
        options: field.options,
        isRequired: field.is_required,
        defaultValue: field.default_value,
        validationRegex: field.validation_regex,
        placeholder: field.placeholder,
        helpText: field.help_text,
        position: field.position,
      });
      return acc;
    }, {});
    
    return NextResponse.json({
      fields: fields?.map(f => ({
        id: f.id,
        entityType: f.entity_type,
        key: f.field_key,
        label: f.field_name,
        type: f.field_type,
        options: f.options,
        isRequired: f.is_required,
        defaultValue: f.default_value,
        validationRegex: f.validation_regex,
        placeholder: f.placeholder,
        helpText: f.help_text,
        position: f.position,
      })) || [],
      grouped,
    });
    
  } catch (error: any) {
    console.error('[Custom Fields API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Criar campo personalizado
// =============================================
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const body = await request.json();
    const {
      organizationId,
      entityType,
      fieldKey,
      fieldLabel,
      fieldType = 'text',
      options,
      isRequired = false,
      defaultValue,
      validationRegex,
      placeholder,
      helpText,
    } = body;
    
    // Validações
    if (!organizationId || !entityType || !fieldKey || !fieldLabel) {
      return NextResponse.json(
        { error: 'organizationId, entityType, fieldKey and fieldLabel are required' },
        { status: 400 }
      );
    }
    
    if (!['contact', 'deal', 'company'].includes(entityType)) {
      return NextResponse.json(
        { error: 'entityType must be: contact, deal or company' },
        { status: 400 }
      );
    }
    
    if (!['text', 'number', 'date', 'select', 'multiselect', 'boolean', 'url', 'email', 'phone'].includes(fieldType)) {
      return NextResponse.json(
        { error: 'Invalid fieldType' },
        { status: 400 }
      );
    }
    
    // Normalizar key (lowercase, underscore)
    const normalizedKey = fieldKey
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    
    // Buscar última posição
    const { data: lastField } = await supabase
      .from('custom_field_definitions')
      .select('position')
      .eq('organization_id', organizationId)
      .eq('entity_type', entityType)
      .order('position', { ascending: false })
      .limit(1)
      .single();
    
    const nextPosition = (lastField?.position || 0) + 1;
    
    // Criar campo
    const { data: field, error } = await supabase
      .from('custom_field_definitions')
      .insert({
        organization_id: organizationId,
        entity_type: entityType,
        field_key: normalizedKey,
        field_name: fieldLabel,
        field_type: fieldType,
        options: options || null,
        is_required: isRequired,
        default_value: defaultValue || null,
        validation_regex: validationRegex || null,
        placeholder: placeholder || null,
        help_text: helpText || null,
        position: nextPosition,
        is_active: true,
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // Unique violation
        return NextResponse.json(
          { error: 'Campo com essa chave já existe' },
          { status: 409 }
        );
      }
      console.error('[Custom Fields API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      field: {
        id: field.id,
        entityType: field.entity_type,
        key: field.field_key,
        label: field.field_name,
        type: field.field_type,
        options: field.options,
        isRequired: field.is_required,
        defaultValue: field.default_value,
        position: field.position,
      },
    });
    
  } catch (error: any) {
    console.error('[Custom Fields API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar campo personalizado
// =============================================
export async function PUT(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const body = await request.json();
    const {
      id,
      organizationId,
      fieldLabel,
      fieldType,
      options,
      isRequired,
      defaultValue,
      validationRegex,
      placeholder,
      helpText,
      position,
      isActive,
    } = body;
    
    if (!id || !organizationId) {
      return NextResponse.json(
        { error: 'id and organizationId are required' },
        { status: 400 }
      );
    }
    
    // Construir objeto de update
    const updates: any = {};
    if (fieldLabel !== undefined) updates.field_name = fieldLabel;
    if (fieldType !== undefined) updates.field_type = fieldType;
    if (options !== undefined) updates.options = options;
    if (isRequired !== undefined) updates.is_required = isRequired;
    if (defaultValue !== undefined) updates.default_value = defaultValue;
    if (validationRegex !== undefined) updates.validation_regex = validationRegex;
    if (placeholder !== undefined) updates.placeholder = placeholder;
    if (helpText !== undefined) updates.help_text = helpText;
    if (position !== undefined) updates.position = position;
    if (isActive !== undefined) updates.is_active = isActive;
    
    const { data: field, error } = await supabase
      .from('custom_field_definitions')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();
    
    if (error) {
      console.error('[Custom Fields API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      field: {
        id: field.id,
        entityType: field.entity_type,
        key: field.field_key,
        label: field.field_name,
        type: field.field_type,
        options: field.options,
        isRequired: field.is_required,
        position: field.position,
      },
    });
    
  } catch (error: any) {
    console.error('[Custom Fields API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Remover campo personalizado
// =============================================
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const organizationId = searchParams.get('organizationId');
  
  if (!id || !organizationId) {
    return NextResponse.json(
      { error: 'id and organizationId are required' },
      { status: 400 }
    );
  }
  
  try {
    // Soft delete (marcar como inativo)
    const { error } = await supabase
      .from('custom_field_definitions')
      .update({ is_active: false })
      .eq('id', id)
      .eq('organization_id', organizationId);
    
    if (error) {
      console.error('[Custom Fields API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('[Custom Fields API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
