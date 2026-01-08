import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// ============================================
// GET - List templates
// ============================================

export async function GET(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category');
  const featured = searchParams.get('featured') === 'true';
  const search = searchParams.get('search');

  try {
    let query = supabase
      .from('automation_templates')
      .select('*')
      .eq('is_public', true)
      .order('usage_count', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    if (featured) {
      query = query.eq('is_featured', true);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Get unique categories
    const { data: categories } = await supabase
      .from('automation_templates')
      .select('category')
      .eq('is_public', true);

    const uniqueCategories = [...new Set(categories?.map(c => c.category).filter(Boolean))];

    return NextResponse.json({ 
      templates: data || [],
      categories: uniqueCategories,
    });

  } catch (error: any) {
    console.error('Templates GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// POST - Use template (create automation from template)
// ============================================

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { templateId, name, storeId } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'templateId required' }, { status: 400 });
    }

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('automation_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Create automation from template
    const { data: automation, error: createError } = await supabase
      .from('automations')
      .insert({
        organization_id: organizationId,
        store_id: storeId,
        name: name || template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
        settings: template.settings,
        status: 'draft',
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (createError) throw createError;

    // Increment template usage count
    await supabase.rpc('increment_template_usage', { template_id: templateId });

    return NextResponse.json({ 
      automation,
      message: 'Automação criada a partir do template',
      requiredCredentials: template.required_credentials || [],
    }, { status: 201 });

  } catch (error: any) {
    console.error('Templates POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
