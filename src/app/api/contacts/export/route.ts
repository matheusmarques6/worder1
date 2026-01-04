import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Worder CRM';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Contatos', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    worksheet.columns = [
      { header: 'Nome', key: 'first_name', width: 15 },
      { header: 'Sobrenome', key: 'last_name', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Telefone', key: 'phone', width: 18 },
      { header: 'Empresa', key: 'company', width: 20 },
      { header: 'Tags', key: 'tags', width: 20 },
      { header: 'Total Pedidos', key: 'total_orders', width: 15 },
      { header: 'Total Gasto', key: 'total_spent', width: 15 },
      { header: 'Criado em', key: 'created_at', width: 15 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    contacts?.forEach((contact, index) => {
      const row = worksheet.addRow({
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : '',
        total_orders: contact.total_orders || 0,
        total_spent: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contact.total_spent || 0),
        created_at: contact.created_at ? new Date(contact.created_at).toLocaleDateString('pt-BR') : '',
      });
      row.height = 22;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `contatos_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting contacts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
