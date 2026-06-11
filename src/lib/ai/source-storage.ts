// =============================================
// Helpers de storage para fontes de conhecimento (bucket ai-sources).
// O file_url gravado em ai_agent_sources é uma URL "pública" do
// Supabase usada como referência de path (o bucket é PRIVADO — o
// download real é server-side via service-role).
// Mesmo padrão de derivação já usado pelo DELETE em
// sources/[sourceId]/route.ts.
// =============================================

export const AI_SOURCES_BUCKET = 'ai-sources'

export function extractStoragePathFromFileUrl(
  fileUrl: string | null | undefined
): string | null {
  if (!fileUrl) return null
  const parts = fileUrl.split(`/${AI_SOURCES_BUCKET}/`)
  return parts.length > 1 && parts[1] ? parts[1] : null
}
