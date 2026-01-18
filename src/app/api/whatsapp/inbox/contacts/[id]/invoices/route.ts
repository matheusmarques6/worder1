import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// GET - Buscar notas fiscais do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('contact_invoices')
      .select('*')
      .eq('contact_id', contactId)
      .order('issue_date', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: invoices, error } = await query

    if (error) throw error

    // Calcular totais
    const totals = (invoices || []).reduce((acc, inv) => ({
      total_count: acc.total_count + 1,
      total_value: acc.total_value + (parseFloat(inv.total_value) || 0),
      pending_count: acc.pending_count + (inv.status === 'pending' ? 1 : 0),
      issued_count: acc.issued_count + (inv.status === 'issued' ? 1 : 0),
    }), {
      total_count: 0,
      total_value: 0,
      pending_count: 0,
      issued_count: 0,
    })

    return NextResponse.json({ 
      invoices: invoices || [],
      totals,
    })
  } catch (error: any) {
    console.error('Error fetching contact invoices:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar/Upload nova nota fiscal
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()

    // Buscar dados do contato
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, organization_id')
      .eq('id', contactId)
      .single()

    if (contactError) throw contactError

    const {
      invoice_number,
      invoice_type = 'nfe',
      invoice_series,
      invoice_key,
      total_value,
      tax_value,
      discount_value,
      issue_date,
      due_date,
      status = 'issued',
      pdf_url,
      xml_url,
      parsed_data,
      notes,
      deal_id,
      order_id,
      uploaded_by,
      uploaded_by_name,
    } = body

    // Validação
    if (!invoice_number && !invoice_key) {
      return NextResponse.json({ 
        error: 'Número da nota ou chave de acesso é obrigatório' 
      }, { status: 400 })
    }

    // Criar nota fiscal
    const { data: invoice, error } = await supabase
      .from('contact_invoices')
      .insert({
        organization_id: contact.organization_id,
        contact_id: contactId,
        invoice_number,
        invoice_type,
        invoice_series,
        invoice_key,
        total_value: total_value || 0,
        tax_value: tax_value || 0,
        discount_value: discount_value || 0,
        issue_date,
        due_date,
        status,
        pdf_url,
        xml_url,
        parsed_data: parsed_data || {},
        notes,
        deal_id,
        order_id,
        uploaded_by,
        uploaded_by_name,
      })
      .select()
      .single()

    if (error) throw error

    // Registrar atividade
    try {
      await supabase
        .from('contact_activities')
        .insert({
          organization_id: contact.organization_id,
          contact_id: contactId,
          invoice_id: invoice.id,
          deal_id: deal_id || null,
          activity_type: 'invoice_uploaded',
          title: `Nota fiscal adicionada: ${invoice_number || invoice_key}`,
          description: notes || null,
          metadata: {
            invoice_type,
            total_value,
            issue_date,
          },
          created_by: uploaded_by,
          created_by_name: uploaded_by_name,
        })
    } catch (activityError) {
      console.warn('Não foi possível registrar atividade:', activityError)
    }

    return NextResponse.json({ 
      invoice,
      message: 'Nota fiscal adicionada com sucesso'
    })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover nota fiscal
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoice_id')

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoice_id é obrigatório' }, { status: 400 })
    }

    const { error } = await supabase
      .from('contact_invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('contact_id', contactId)

    if (error) throw error

    return NextResponse.json({ 
      message: 'Nota fiscal removida com sucesso'
    })
  } catch (error: any) {
    console.error('Error deleting invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
