'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface ChatTemplate {
  id: string
  organization_id: string
  store_id?: string
  created_by?: string
  name: string
  category: string
  content: string
  variables: string[]
  media_url?: string
  media_type?: string
  whatsapp_template_id?: string
  whatsapp_status: string
  usage_count: number
  last_used_at?: string
  is_favorite: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  profiles?: {
    id: string
    email: string
    full_name: string
  }
}

export interface CreateTemplateParams {
  name: string
  category?: string
  content: string
  variables?: string[]
  media_url?: string
  media_type?: string
}

interface UseChatTemplatesOptions {
  organizationId: string
  storeId?: string | null
  category?: string
  autoLoad?: boolean
}

interface UseChatTemplatesReturn {
  templates: ChatTemplate[]
  categories: Array<{ name: string; count: number }>
  isLoading: boolean
  error: string | null
  loadTemplates: () => Promise<void>
  createTemplate: (params: CreateTemplateParams) => Promise<ChatTemplate | null>
  updateTemplate: (id: string, updates: Partial<ChatTemplate>) => Promise<boolean>
  deleteTemplate: (id: string) => Promise<boolean>
  useTemplate: (id: string, variables?: Record<string, string>) => Promise<string | null>
  toggleFavorite: (id: string) => Promise<boolean>
}

// =============================================
// Hook
// =============================================

export function useChatTemplates({
  organizationId,
  storeId,
  category,
  autoLoad = true,
}: UseChatTemplatesOptions): UseChatTemplatesReturn {
  const [templates, setTemplates] = useState<ChatTemplate[]>([])
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // Load Templates
  // =============================================
  const loadTemplates = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ organization_id: organizationId })

      if (storeId) {
        params.append('store_id', storeId)
      }

      if (category && category !== 'all') {
        params.append('category', category)
      }

      const response = await fetch(`/api/chat-templates?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar templates')
      }

      setTemplates(data.templates || [])
      setCategories(data.categories || [])
    } catch (err: any) {
      console.error('[useChatTemplates] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, storeId, category])

  // =============================================
  // Create Template
  // =============================================
  const createTemplate = useCallback(async (params: CreateTemplateParams): Promise<ChatTemplate | null> => {
    if (!organizationId) {
      setError('Organização não definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/chat-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          store_id: storeId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar template')
      }

      // Reload templates
      await loadTemplates()

      return data.template
    } catch (err: any) {
      console.error('[useChatTemplates] Create error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, storeId, loadTemplates])

  // =============================================
  // Update Template
  // =============================================
  const updateTemplate = useCallback(async (id: string, updates: Partial<ChatTemplate>): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/chat-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar template')
      }

      // Update local state
      setTemplates(prev => prev.map(t => (t.id === id ? { ...t, ...data.template } : t)))

      return true
    } catch (err: any) {
      console.error('[useChatTemplates] Update error:', err)
      setError(err.message)
      return false
    }
  }, [])

  // =============================================
  // Delete Template
  // =============================================
  const deleteTemplate = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/chat-templates?id=${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir template')
      }

      // Remove from local state
      setTemplates(prev => prev.filter(t => t.id !== id))

      return true
    } catch (err: any) {
      console.error('[useChatTemplates] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [])

  // =============================================
  // Use Template (apply variables)
  // =============================================
  const useTemplate = useCallback(async (
    id: string,
    variables?: Record<string, string>
  ): Promise<string | null> => {
    const template = templates.find(t => t.id === id)

    if (!template) {
      setError('Template não encontrado')
      return null
    }

    let content = template.content

    // Replace variables
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
      }
    }

    // Update usage count
    try {
      await fetch('/api/chat-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          usage_count: template.usage_count + 1,
          last_used_at: new Date().toISOString(),
        }),
      })

      // Update local state
      setTemplates(prev => prev.map(t =>
        t.id === id
          ? { ...t, usage_count: t.usage_count + 1, last_used_at: new Date().toISOString() }
          : t
      ))
    } catch (err) {
      console.error('[useChatTemplates] Usage update error:', err)
    }

    return content
  }, [templates])

  // =============================================
  // Toggle Favorite
  // =============================================
  const toggleFavorite = useCallback(async (id: string): Promise<boolean> => {
    const template = templates.find(t => t.id === id)
    if (!template) return false

    return updateTemplate(id, { is_favorite: !template.is_favorite })
  }, [templates, updateTemplate])

  // =============================================
  // Auto Load
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadTemplates()
    }
  }, [autoLoad, organizationId, storeId, category, loadTemplates])

  return {
    templates,
    categories,
    isLoading,
    error,
    loadTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    useTemplate,
    toggleFavorite,
  }
}

export default useChatTemplates
