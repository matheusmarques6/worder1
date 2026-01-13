/**
 * Helpers para criar respostas HTTP com PDFs
 */

/**
 * Cria uma Response com PDF para download
 */
export function pdfResponse(
  pdfData: Uint8Array | Buffer,
  filename: string,
  options?: {
    inline?: boolean // Se true, abre no browser em vez de baixar
  }
): Response {
  const disposition = options?.inline 
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`

  // Sempre converter para Uint8Array para compatibilidade com Response
  const body = new Uint8Array(pdfData)

  return new Response(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}

/**
 * Cria uma Response de erro em JSON
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: string
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      details: details || undefined,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}

/**
 * Erros pré-definidos
 */
export const ReportErrors = {
  UNAUTHORIZED: () => errorResponse('Não autorizado', 401),
  FORBIDDEN: () => errorResponse('Acesso negado', 403),
  NOT_FOUND: () => errorResponse('Relatório não encontrado', 404),
  BAD_REQUEST: (details?: string) => errorResponse('Requisição inválida', 400, details),
  INTERNAL_ERROR: (details?: string) => errorResponse('Erro ao gerar relatório', 500, details),
} as const
