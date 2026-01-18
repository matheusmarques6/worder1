import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'

// GET - Buscar tarefas do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'all', 'pending', 'completed'
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabase
      .from('tasks')
      .select(`
        *,
        deal:deals(id, title, value, status),
        assigned_user:profiles!tasks_assigned_to_fkey(id, first_name, last_name, avatar_url)
      `)
      .or(`contact_id.eq.${contactId},unified_contact_id.eq.${contactId}`)
      .order('due_date', { ascending: true })
      .limit(limit)

    // Filtrar por status
    if (status === 'pending') {
      query = query.in('status', ['pending', 'in_progress'])
    } else if (status === 'completed') {
      query = query.eq('status', 'completed')
    }

    const { data: tasks, error } = await query

    if (error) throw error

    // Formatar resposta
    const formattedTasks = (tasks || []).map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date,
      due_time: task.due_time,
      reminder_at: task.reminder_at,
      
      // Atribuição
      assigned_to: task.assigned_to,
      assigned_to_name: task.assigned_to_name || 
        (task.assigned_user ? `${task.assigned_user.first_name} ${task.assigned_user.last_name || ''}`.trim() : null),
      assigned_user: task.assigned_user,
      
      // Contexto
      contact_id: task.contact_id || task.unified_contact_id,
      deal_id: task.deal_id,
      deal: task.deal,
      conversation_id: task.conversation_id,
      
      // Status de atraso
      is_overdue: task.status !== 'completed' && new Date(task.due_date) < new Date(),
      is_today: new Date(task.due_date).toDateString() === new Date().toDateString(),
      
      // Resultado
      outcome: task.outcome,
      outcome_type: task.outcome_type,
      completed_at: task.completed_at,
      completed_by_name: task.completed_by_name,
      
      // Datas
      created_at: task.created_at,
      updated_at: task.updated_at,
    }))

    // Agrupar por status para facilitar exibição
    const grouped = {
      overdue: formattedTasks.filter(t => t.is_overdue),
      today: formattedTasks.filter(t => t.is_today && !t.is_overdue && t.status !== 'completed'),
      upcoming: formattedTasks.filter(t => !t.is_overdue && !t.is_today && t.status !== 'completed'),
      completed: formattedTasks.filter(t => t.status === 'completed'),
    }

    return NextResponse.json({ 
      tasks: formattedTasks,
      grouped,
      total: formattedTasks.length,
      pending_count: formattedTasks.filter(t => t.status !== 'completed').length,
      overdue_count: grouped.overdue.length,
    })
  } catch (error: any) {
    console.error('Error fetching contact tasks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar nova tarefa para o contato
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()

    // Buscar dados do contato para pegar organization_id
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, organization_id, first_name, whatsapp, phone')
      .eq('id', contactId)
      .single()

    if (contactError) {
      // Fallback para whatsapp_contacts
      const { data: legacyContact, error: legacyError } = await supabase
        .from('whatsapp_contacts')
        .select('id, organization_id, name, phone_number')
        .eq('id', contactId)
        .single()
      
      if (legacyError) throw contactError
      
      // Usar dados do legacyContact
      return await createTaskForContact(legacyContact, body, true)
    }

    return await createTaskForContact(contact, body, false)
  } catch (error: any) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function createTaskForContact(contact: any, body: any, isLegacy: boolean) {
  const {
    title,
    description,
    type = 'task',
    priority = 'normal',
    due_date,
    due_time,
    reminder_at,
    assigned_to,
    assigned_to_name,
    deal_id,
    conversation_id,
    created_by,
    created_by_name,
  } = body

  // Validação
  if (!title) {
    return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })
  }
  if (!due_date) {
    return NextResponse.json({ error: 'Data de vencimento é obrigatória' }, { status: 400 })
  }

  // Criar tarefa
  const taskData: Record<string, any> = {
    organization_id: contact.organization_id,
    title,
    description,
    type,
    priority,
    due_date,
    due_time: due_time || null,
    reminder_at: reminder_at || null,
    assigned_to: assigned_to || null,
    assigned_to_name: assigned_to_name || null,
    deal_id: deal_id || null,
    conversation_id: conversation_id || null,
    created_by: created_by || null,
    created_by_name: created_by_name || null,
    status: 'pending',
  }

  // Usar o campo correto dependendo se é legado ou não
  if (isLegacy) {
    taskData.contact_id = contact.id
  } else {
    taskData.unified_contact_id = contact.id
    taskData.contact_id = contact.id // Manter também para compatibilidade
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single()

  if (error) throw error

  // Registrar atividade
  try {
    await supabase
      .from('contact_activities')
      .insert({
        organization_id: contact.organization_id,
        contact_id: contact.id,
        task_id: task.id,
        conversation_id: conversation_id || null,
        deal_id: deal_id || null,
        activity_type: 'task_created',
        title: `Tarefa criada: ${title}`,
        description: description || null,
        metadata: {
          task_type: type,
          priority,
          due_date,
          assigned_to_name,
        },
        created_by,
        created_by_name,
      })
  } catch (activityError) {
    console.warn('Não foi possível registrar atividade:', activityError)
  }

  return NextResponse.json({ 
    task,
    message: 'Tarefa criada com sucesso'
  })
}

// PATCH - Atualizar tarefa (marcar como concluída, etc)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()
    const { task_id, ...updates } = body

    if (!task_id) {
      return NextResponse.json({ error: 'task_id é obrigatório' }, { status: 400 })
    }

    // Campos permitidos para atualização
    const allowedFields = [
      'title', 'description', 'type', 'priority', 'status',
      'due_date', 'due_time', 'reminder_at',
      'assigned_to', 'assigned_to_name',
      'outcome', 'outcome_type',
      'completed_at', 'completed_by', 'completed_by_name'
    ]

    const filteredUpdates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key]
      }
    }

    // Se estiver marcando como concluída, adicionar timestamp
    if (filteredUpdates.status === 'completed' && !filteredUpdates.completed_at) {
      filteredUpdates.completed_at = new Date().toISOString()
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .update({
        ...filteredUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task_id)
      .or(`contact_id.eq.${contactId},unified_contact_id.eq.${contactId}`)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      task,
      message: 'Tarefa atualizada com sucesso'
    })
  } catch (error: any) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
