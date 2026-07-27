// =============================================
// Validacao de midia p/ Meta Cloud API (compartilhada)
// Extraido de inbox/conversations/[id]/media/route.ts para reuso
// pela rota de upload de header de template.
// =============================================

export interface MediaFileLike {
  name: string
  size: number
  type: string
}

// Meta Cloud API enforces different size limits per media category.
export const MAX_SIZE_BY_TYPE: Record<string, number> = {
  image: 5 * 1024 * 1024,      // 5 MB
  video: 16 * 1024 * 1024,     // 16 MB
  audio: 16 * 1024 * 1024,     // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
}
export const FALLBACK_MAX_SIZE = 16 * 1024 * 1024

// MIME types accepted by Meta's /media endpoint (fora disso: code 131053).
export const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/ogg'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
  ],
}

export const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar', '.msi']

export function validateWhatsAppMediaFile(
  file: MediaFileLike,
  mediaType: string,
): { valid: boolean; error?: string } {
  const maxSize = MAX_SIZE_BY_TYPE[mediaType] ?? FALLBACK_MAX_SIZE
  if (file.size > maxSize) {
    const label = mediaType === 'image' ? 'Imagem'
      : mediaType === 'video' ? 'Video'
      : mediaType === 'audio' ? 'Audio'
      : 'Documento'
    return { valid: false, error: `${label} muito grande. Maximo: ${maxSize / (1024 * 1024)}MB` }
  }

  if (DANGEROUS_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return { valid: false, error: 'Tipo de arquivo não permitido por segurança' }
  }

  const allowedList = ALLOWED_TYPES[mediaType as keyof typeof ALLOWED_TYPES]
  if (allowedList && !allowedList.includes(file.type)) {
    return { valid: false, error: `Tipo de arquivo nao aceito pelo WhatsApp para ${mediaType}: ${file.type}` }
  }

  return { valid: true }
}
