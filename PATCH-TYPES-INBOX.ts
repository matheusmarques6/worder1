// =====================================================
// PATCH: Adicionar 'attachments' ao InboxNote
// 
// Edite o arquivo src/types/inbox.ts
// Encontre a interface InboxNote (linha ~226) e adicione:
// =====================================================

/*
ANTES:
export interface InboxNote {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  content: string
  note_type: 'general' | 'call' | 'meeting' | 'follow_up' | 'important' | 'note'
  is_pinned: boolean
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at?: string
}

DEPOIS:
export interface InboxNote {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  content: string
  note_type: 'general' | 'call' | 'meeting' | 'follow_up' | 'important' | 'note'
  is_pinned: boolean
  attachments?: NoteAttachment[]  // <-- ADICIONAR ESTA LINHA
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at?: string
}

// E adicione este tipo antes do InboxNote:
export interface NoteAttachment {
  type: 'image' | 'document'
  url: string
  name: string
  size?: number
}
*/

// =====================================================
// Ou copie este código diretamente para o arquivo:
// =====================================================

export interface NoteAttachment {
  type: 'image' | 'document'
  url: string
  name: string
  size?: number
}

export interface InboxNote {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  content: string
  note_type: 'general' | 'call' | 'meeting' | 'follow_up' | 'important' | 'note'
  is_pinned: boolean
  attachments?: NoteAttachment[]
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at?: string
}
