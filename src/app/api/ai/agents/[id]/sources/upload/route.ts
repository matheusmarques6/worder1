import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// Route Segment Config (Next.js 14 App Router)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Tipos de arquivo permitidos
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'text/plain',
  'text/csv',
]

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

// =====================================================
// POST - UPLOAD DE ARQUIVO
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const agentId = params.id

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    // Validações
    if (!file) {
      return NextResponse.json({ error: 'file é obrigatório' }, { status: 400 })
    }

    // Validar tipo de arquivo
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Tipo de arquivo não suportado. Use PDF, DOCX, DOC, TXT ou CSV.',
        allowed_types: ALLOWED_MIME_TYPES,
      }, { status: 400 })
    }

    // Validar tamanho
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `Arquivo muito grande. Máximo permitido: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }, { status: 400 })
    }

    // Verificar se agente existe - RLS filtra automaticamente
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${user.organization_id}/${agentId}/${timestamp}_${sanitizedName}`

    // Upload para o storage do Supabase
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('ai-sources')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      console.log('Storage upload failed, will process file content directly')
    }

    // Obter URL pública (se upload foi bem sucedido)
    let fileUrl = null
    if (uploadData) {
      const { data: urlData } = supabase
        .storage
        .from('ai-sources')
        .getPublicUrl(fileName)
      
      fileUrl = urlData?.publicUrl
    }

    // Criar registro da fonte - usa organization_id do usuário autenticado
    const sourceData = {
      organization_id: user.organization_id,
      agent_id: agentId,
      source_type: 'file',
      name: file.name,
      file_url: fileUrl,
      file_size_bytes: file.size,
      original_filename: file.name,
      mime_type: file.type,
      status: 'pending',
      chunks_count: 0,
    }

    const { data: source, error: sourceError } = await supabase
      .from('ai_agent_sources')
      .insert(sourceData)
      .select()
      .single()

    if (sourceError) {
      console.error('Error creating source:', sourceError)
      throw sourceError
    }

    // Processar arquivo em background
    processFileAsync(source.id, user.organization_id, fileBuffer, file.type).catch(err => {
      console.error('Error in async file processing:', err)
    })

    return NextResponse.json({ source }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/sources/upload:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PROCESSAMENTO ASSÍNCRONO DO ARQUIVO
// =====================================================

async function processFileAsync(
  sourceId: string, 
  organizationId: string,
  fileBuffer: Buffer,
  mimeType: string
) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: organizationId,
        file_content: fileBuffer.toString('base64'),
        mime_type: mimeType,
      }),
    })
  } catch (error) {
    console.error('Error triggering file processing:', error)
  }
}
