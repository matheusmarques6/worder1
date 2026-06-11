import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { assertAgentInOrg } from '@/lib/ai/agent-access';

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
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id do
    // formData é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id
    const organizationId = auth.user.organization_id

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    // organization_id from formData is intentionally IGNORED (P1 compat no-op)

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

    // Verificar se agente pertence à org autenticada
    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${organizationId}/${agentId}/${timestamp}_${sanitizedName}`

    // Upload para o storage do Supabase
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('ai-sources')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
      })

    let storageUploaded = true
    if (uploadError) {
      storageUploaded = false
      console.error('[ai/sources/upload] Storage upload failed (bucket ai-sources):', uploadError.message)
      // Fallback explícito: o processamento abaixo usa o buffer em memória
      // (base64), então a fonte ainda será indexada — mas sem arquivo
      // arquivado (file_url = null), o que torna o REPROCESS impossível
      // para esta fonte. O cliente é informado via storage_uploaded: false.
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

    // Criar registro da fonte
    const sourceData = {
      organization_id: organizationId,
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
    // Para arquivos, passamos o conteúdo diretamente se não houver storage
    processFileAsync(source.id, organizationId, fileBuffer, file.type).catch(err => {
      console.error('Error in async file processing:', err)
    })

    return NextResponse.json(
      {
        source,
        storage_uploaded: storageUploaded,
        ...(storageUploaded ? {} : {
          warning: 'Arquivo será indexado, mas não pôde ser arquivado no storage (bucket ai-sources indisponível). Reprocessamento futuro exigirá novo upload.',
        }),
      },
      { status: 201 }
    )

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
  const supabase = getSupabaseAdmin()
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const res = await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || ''}`,
      },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: organizationId,
        file_content: fileBuffer.toString('base64'),
        mime_type: mimeType,
      }),
    })

    if (!res.ok) {
      // process/document já marca a fonte como error no catch dele;
      // este throw cobre respostas de erro ANTES do processamento
      // (404 fonte não encontrada, 400 etc.).
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || `process/document respondeu ${res.status}`)
    }
  } catch (error: any) {
    console.error('Error triggering file processing:', error)
    // Sem isso a fonte ficaria presa em 'pending' para sempre.
    await supabase
      .from('ai_agent_sources')
      .update({
        status: 'error',
        error_message: `Falha ao iniciar processamento: ${error?.message || 'erro desconhecido'}. Clique em Reprocessar.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .then(undefined, () => {})
  }
}
