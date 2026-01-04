import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-route';


async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

function normalizePhone(phone: string): string {
  if (!phone) return '';
  let n = phone.replace(/\D/g, '');
  if (n.startsWith('0')) n = n.substring(1);
  if (n.length <= 11) n = '55' + n;
  return n;
}

// GET - Lista phonebooks ou contatos
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const phonebookId = searchParams.get('phonebook_id');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (phonebookId) {
      // Listar contatos
      let query = supabase
        .from('phonebook_contacts')
        .select('*', { count: 'exact' })
        .eq('phonebook_id', phonebookId)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.or(`name.ilike.%${search}%,mobile.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return NextResponse.json({ contacts: data || [], total: count || 0, limit, offset });
    }

    // Listar phonebooks
    const { data, error } = await supabase
      .from('phonebooks')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ phonebooks: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar phonebook ou adicionar contatos
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    if (action === 'create_phonebook') {
      const { name, description } = body;
      if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

      const { data, error } = await supabase
        .from('phonebooks')
        .insert({ organization_id: orgId, name, description })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ phonebook: data }, { status: 201 });
    }

    if (action === 'add_contacts') {
      const { phonebook_id, contacts } = body;
      if (!phonebook_id || !Array.isArray(contacts)) {
        return NextResponse.json({ error: 'phonebook_id and contacts array required' }, { status: 400 });
      }

      const { data: pb } = await supabase
        .from('phonebooks')
        .select('id')
        .eq('id', phonebook_id)
        .eq('organization_id', orgId)
        .single();

      if (!pb) return NextResponse.json({ error: 'Phonebook not found' }, { status: 404 });

      const toInsert = contacts
        .map((c: any) => ({
          organization_id: orgId,
          phonebook_id,
          name: c.name || '',
          mobile: normalizePhone(c.mobile || c.phone),
          email: c.email || '',
          custom_fields: c.custom_fields || {},
        }))
        .filter((c: any) => c.mobile);

      if (toInsert.length === 0) {
        return NextResponse.json({ error: 'No valid contacts' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('phonebook_contacts')
        .insert(toInsert)
        .select();

      if (error) throw error;
      return NextResponse.json({ contacts: data, added: data?.length || 0 }, { status: 201 });
    }

    if (action === 'import_csv') {
      const { phonebook_id, csv_data } = body;
      if (!phonebook_id || !csv_data) {
        return NextResponse.json({ error: 'phonebook_id and csv_data required' }, { status: 400 });
      }

      const lines = csv_data.split('\n').filter((l: string) => l.trim());
      const headers = lines[0].toLowerCase().split(',').map((h: string) => h.trim().replace(/"/g, ''));
      
      const contacts = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v: string) => v.trim().replace(/"/g, ''));
        if (values.length < headers.length) continue;

        const contact: any = { custom_fields: {} };
        headers.forEach((h: string, idx: number) => {
          const v = values[idx];
          if (['nome', 'name'].includes(h)) contact.name = v;
          else if (['telefone', 'phone', 'mobile', 'celular', 'whatsapp'].includes(h)) contact.mobile = normalizePhone(v);
          else if (h === 'email') contact.email = v;
          else contact.custom_fields[h] = v;
        });

        if (contact.mobile) {
          contacts.push({
            organization_id: orgId,
            phonebook_id,
            ...contact,
          });
        }
      }

      if (contacts.length === 0) {
        return NextResponse.json({ error: 'No valid contacts in CSV' }, { status: 400 });
      }

      const { data, error } = await supabase.from('phonebook_contacts').insert(contacts).select();
      if (error) throw error;

      return NextResponse.json({ imported: data?.length || 0, total_rows: lines.length - 1 }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar phonebook ou contato
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, type, ...updateData } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    if (type === 'contact') {
      const allowed = ['name', 'mobile', 'email', 'custom_fields'];
      const filtered: any = {};
      allowed.forEach(f => { if (f in updateData) filtered[f] = f === 'mobile' ? normalizePhone(updateData[f]) : updateData[f]; });

      const { data, error } = await supabase
        .from('phonebook_contacts')
        .update(filtered)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ contact: data });
    }

    const { data, error } = await supabase
      .from('phonebooks')
      .update({ name: updateData.name, description: updateData.description, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ phonebook: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Deletar phonebook ou contato
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    const type = request.nextUrl.searchParams.get('type');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    if (type === 'contact') {
      await supabase.from('phonebook_contacts').delete().eq('id', id).eq('organization_id', orgId);
    } else {
      // Verificar se está em uso
      const { data: campaigns } = await supabase
        .from('whatsapp_campaigns')
        .select('id')
        .eq('phonebook_id', id)
        .eq('status', 'RUNNING')
        .limit(1);

      if (campaigns && campaigns.length > 0) {
        return NextResponse.json({ error: 'Phonebook in use by running campaign' }, { status: 400 });
      }

      await supabase.from('phonebook_contacts').delete().eq('phonebook_id', id);
      await supabase.from('phonebooks').delete().eq('id', id).eq('organization_id', orgId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
