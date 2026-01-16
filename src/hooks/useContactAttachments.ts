// =============================================
// Hook: useContactAttachments
// Gerencia anexos de um contato
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'

export interface ContactAttachment {
  id: string
  organization_id: string
  contact_id: string
  file_name: string
  file_url: string
  file_type: string
  file_size: number
  description?: string
  category: 'document' | 'contract' | 'invoice' | 'proposal' | 'image' | 'other'
  uploaded_by?: string
  uploaded_by_name?: string
  created_at: string
}

interface UseContactAttachmentsOptions {
  contactId: string | null
  organizationId: string
  autoLoad?: boolean
}

interface UseContactAttachmentsReturn {
  attachments: ContactAttachment[]
  isLoading: boolean
  isUploading: boolean
  error: string | null
  loadAttachments: () => Promise<void>
  uploadAttachment: (file: File, description?: string, category?: string) => Promise<ContactAttachment | null>
  deleteAttachment: (attachmentId: string) => Promise<boolean>
  getAttachmentsByCategory: (category: string) => ContactAttachment[]
  totalSize: number
}

export function useContactAttachments({
  contactId,
  organizationId,
  autoLoad = true
}: UseContactAttachmentsOptions): UseContactAttachmentsReturn {
  const [attachments, setAttachments] = useState<ContactAttachment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // CARREGAR ANEXOS
  // =============================================
  const loadAttachments = useCallback(async () => {
    if (!contactId) {
      setAttachments([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/contacts/${contactId}/attachments`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar anexos')
      }

      setAttachments(data.attachments || [])
    } catch (err: any) {
      console.error('[useContactAttachments] Load error:', err)
      setError(err.message)
      setAttachments([])
    } finally {
      setIsLoading(false)
    }
  }, [contactId])

  // =============================================
  // UPLOAD DE ANEXO
  // =============================================
  const uploadAttachment = useCallback(async (
    file: File,
    description?: string,
    category: string = 'document'
  ): Promise<ContactAttachment | null> => {
    if (!contactId || !organizationId) {
      setError('Contato ou organização não definidos')
      return null
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('organization_id', organizationId)
      formData.append('category', category)
      if (description) {
        formData.append('description', description)
      }

      const response = await fetch(`/api/contacts/${contactId}/attachments`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao fazer upload')
      }

      // Adicionar ao estado local
      setAttachments(prev => [data.attachment, ...prev])

      return data.attachment
    } catch (err: any) {
      console.error('[useContactAttachments] Upload error:', err)
      setError(err.message)
      return null
    } finally {
      setIsUploading(false)
    }
  }, [contactId, organizationId])

  // =============================================
  // DELETAR ANEXO
  // =============================================
  const deleteAttachment = useCallback(async (attachmentId: string): Promise<boolean> => {
    if (!contactId) return false

    setError(null)

    try {
      const response = await fetch(
        `/api/contacts/${contactId}/attachments?attachment_id=${attachmentId}`,
        { method: 'DELETE' }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao remover anexo')
      }

      // Remover do estado local
      setAttachments(prev => prev.filter(a => a.id !== attachmentId))

      return true
    } catch (err: any) {
      console.error('[useContactAttachments] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [contactId])

  // =============================================
  // FILTRAR POR CATEGORIA
  // =============================================
  const getAttachmentsByCategory = useCallback((category: string): ContactAttachment[] => {
    return attachments.filter(a => a.category === category)
  }, [attachments])

  // =============================================
  // CALCULAR TAMANHO TOTAL
  // =============================================
  const totalSize = attachments.reduce((sum, a) => sum + (a.file_size || 0), 0)

  // =============================================
  // AUTO LOAD
  // =============================================
  useEffect(() => {
    if (autoLoad && contactId) {
      loadAttachments()
    }
  }, [autoLoad, contactId, loadAttachments])

  return {
    attachments,
    isLoading,
    isUploading,
    error,
    loadAttachments,
    uploadAttachment,
    deleteAttachment,
    getAttachmentsByCategory,
    totalSize,
  }
}

export default useContactAttachments
