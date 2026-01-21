'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, UserPlus, Search, Check, Bot, Users } from 'lucide-react'

interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
  role?: string
  source?: 'user' | 'agent' // De onde veio
}

interface AssignModalProps {
  isOpen: boolean
  onClose: () => void
  onAssign: (userId: string | null) => Promise<void>
  currentAssignedId?: string | null
  conversationId: string
  organizationId?: string
  storeId?: string
}

export function AssignModal({
  isOpen,
  onClose,
  onAssign,
  currentAssignedId,
  conversationId,
  organizationId,
  storeId,
}: AssignModalProps) {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(currentAssignedId || null)
  const [error, setError] = useState<string | null>(null)

  // Carregar usuários de múltiplas fontes
  useEffect(() => {
    if (!isOpen) return

    async function loadUsers() {
      setIsFetching(true)
      setError(null)
      const allUsers: User[] = []
      
      try {
        // 1. Tentar buscar usuários da API de users (profiles)
        try {
          const usersResponse = await fetch('/api/users?role=agent,admin,owner')
          if (usersResponse.ok) {
            const usersData = await usersResponse.json()
            const profileUsers = (usersData.users || usersData || []).map((u: any) => ({
              ...u,
              source: 'user' as const
            }))
            allUsers.push(...profileUsers)
          }
        } catch (e) {
          console.log('Não foi possível buscar de /api/users:', e)
        }

        // 2. Tentar buscar agentes da tabela whatsapp_agents
        try {
          let agentsUrl = '/api/whatsapp/agents?is_active=true'
          if (organizationId) agentsUrl += `&organization_id=${organizationId}`
          if (storeId) agentsUrl += `&store_id=${storeId}`
          
          const agentsResponse = await fetch(agentsUrl)
          if (agentsResponse.ok) {
            const agentsData = await agentsResponse.json()
            const agents = (agentsData.agents || agentsData || [])
              .filter((a: any) => a.is_active !== false)
              .map((a: any) => ({
                id: a.user_id || a.id,
                name: a.name || a.full_name || 'Agente',
                email: a.email || '',
                avatar_url: a.avatar_url,
                role: 'agent',
                source: 'agent' as const
              }))
            
            // Adicionar apenas agentes que não estão na lista de usuários
            agents.forEach((agent: User) => {
              if (!allUsers.find(u => u.id === agent.id)) {
                allUsers.push(agent)
              }
            })
          }
        } catch (e) {
          console.log('Não foi possível buscar agentes:', e)
        }

        // Se não encontrou nenhum usuário, mostrar erro
        if (allUsers.length === 0) {
          setError('Nenhum usuário ou agente encontrado. Certifique-se de que existem usuários ou agentes cadastrados.')
        }

        setUsers(allUsers)
      } catch (err) {
        console.error('Error loading users:', err)
        setError('Erro ao carregar usuários')
      } finally {
        setIsFetching(false)
      }
    }

    loadUsers()
    setSelectedUserId(currentAssignedId || null)
  }, [isOpen, currentAssignedId, organizationId, storeId])

  const handleAssign = async () => {
    setIsLoading(true)
    try {
      await onAssign(selectedUserId)
      onClose()
    } catch (err) {
      console.error('Error assigning:', err)
      setError('Erro ao atribuir conversa')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  // Filtrar usuários
  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(search.toLowerCase()) ||
    user.email?.toLowerCase().includes(search.toLowerCase())
  )

  const getInitials = (name: string) => {
    if (!name) return '??'
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-2xl w-full max-w-md border border-dark-700 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Atribuir Conversa</h3>
              <p className="text-xs text-dark-400">Selecione um membro da equipe</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-dark-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou email..."
              className="w-full px-4 py-2.5 pl-10 bg-dark-700 border border-dark-600 rounded-xl 
                         text-white placeholder:text-dark-500 
                         focus:outline-none focus:border-primary-500"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-error-500/10 border border-error-500/20 rounded-xl text-error-400 text-sm">
              {error}
            </div>
          )}

          {/* Opção de remover atribuição */}
          {currentAssignedId && (
            <button
              onClick={() => setSelectedUserId(null)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl mb-2 transition-all ${
                selectedUserId === null
                  ? 'bg-red-500/20 border-2 border-red-500'
                  : 'bg-dark-700/50 border-2 border-transparent hover:border-dark-600'
              }`}
            >
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <X className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-red-400">Remover Atribuição</p>
                <p className="text-xs text-dark-500">Deixar conversa não atribuída</p>
              </div>
              {selectedUserId === null && (
                <Check className="w-5 h-5 text-red-400" />
              )}
            </button>
          )}

          {/* Users List */}
          {isFetching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-dark-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {search ? 'Nenhum usuário encontrado com esse termo' : 'Nenhum usuário disponível'}
              </p>
              <p className="text-xs mt-2 text-dark-500">
                Verifique se há usuários ou agentes cadastrados
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    selectedUserId === user.id
                      ? 'bg-primary-500/20 border-2 border-primary-500'
                      : 'bg-dark-700/50 border-2 border-transparent hover:border-dark-600'
                  }`}
                >
                  {user.avatar_url ? (
                    <img 
                      src={user.avatar_url} 
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 
                                    rounded-full flex items-center justify-center">
                      <span className="text-white font-medium text-sm">
                        {getInitials(user.name || user.email)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-white">{user.name || 'Sem nome'}</p>
                    <p className="text-xs text-dark-400">{user.email || user.role || ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.source === 'agent' && (
                      <span className="px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded-full flex items-center gap-1">
                        <Bot className="w-3 h-3" /> Agente
                      </span>
                    )}
                    {selectedUserId === user.id && (
                      <Check className="w-5 h-5 text-primary-400" />
                    )}
                    {currentAssignedId === user.id && selectedUserId !== user.id && (
                      <span className="px-2 py-0.5 text-[10px] bg-dark-600 text-dark-300 rounded-full">
                        Atual
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-dark-700">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-dark-700 text-dark-300 rounded-xl 
                       hover:bg-dark-600 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleAssign}
            disabled={isLoading || (selectedUserId === currentAssignedId)}
            className="flex-1 py-2.5 bg-primary-500 text-white rounded-xl 
                       hover:bg-primary-600 transition-colors font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Atribuindo...
              </>
            ) : selectedUserId === null ? (
              'Remover Atribuição'
            ) : (
              'Atribuir'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AssignModal
