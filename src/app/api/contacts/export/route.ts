import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }

  try {
    // Fetch contacts
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Worder CRM';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Contatos', {
      views: [{ state: 'frozen', ySplit: 1 }] // Freeze header row
    });

    // Define columns
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

    // Header styles
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF97316' } // Orange
      };
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle'
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF3F3F46' } },
        left: { style: 'thin', color: { argb: 'FF3F3F46' } },
        bottom: { style: 'thin', color: { argb: 'FF3F3F46' } },
        right: { style: 'thin', color: { argb: 'FF3F3F46' } }
      };
    });

    // Add data rows
    contacts?.forEach((contact, index) => {
      const row = worksheet.addRow({
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : '',
        total_orders: contact.total_orders || 0,
        total_spent: new Intl.NumberFormat('pt-BR', { 
          style: 'currency', 
          currency: 'BRL' 
        }).format(contact.total_spent || 0),
        created_at: contact.created_at 
          ? new Date(contact.created_at).toLocaleDateString('pt-BR')
          : '',
      });

      row.height = 22;
      
      // Zebra striping
      const fillColor = index % 2 === 0 ? 'FF1F1F23' : 'FF27272A';
      
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillColor }
        };
        cell.font = {
          color: { argb: 'FFFFFFFF' },
          size: 10
        };
        cell.alignment = {
          horizontal: 'left',
          vertical: 'middle'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF3F3F46' } },
          left: { style: 'thin', color: { argb: 'FF3F3F46' } },
          bottom: { style: 'thin', color: { argb: 'FF3F3F46' } },
          right: { style: 'thin', color: { argb: 'FF3F3F46' } }
        };
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
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
