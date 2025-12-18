'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Trash2, Play, Pause, Save, Settings, Zap, MessageSquare,
  Clock, GitBranch, ArrowRight, Loader2, ChevronDown, Eye, Copy, X
} from 'lucide-react'
import { useWhatsAppFlows } from '@/hooks/useWhatsApp'

const nodeTypes = [
  { type: 'START', label: 'Início', icon: Play, color: 'emerald', description: 'Ponto de entrada do fluxo' },
  { type: 'MESSAGE', label: 'Mensagem', icon: MessageSquare, color: 'violet', description: 'Enviar mensagem de texto' },
  { type: 'QUESTION', label: 'Pergunta', icon: GitBranch, color: 'cyan', description: 'Pergunta com opções' },
  { type: 'DELAY', label: 'Delay', icon: Clock, color: 'amber', description: 'Aguardar tempo' },
  { type: 'CONDITION', label: 'Condição', icon: GitBranch, color: 'blue', description: 'Desvio condicional' },
  { type: 'ACTION', label: 'Ação', icon: Zap, color: 'orange', description: 'Executar ação' },
  { type: 'END', label: 'Fim', icon: ArrowRight, color: 'red', description: 'Finalizar fluxo' },
]

export default function FlowsPage() {
  const { flows, selectedFlow, setSelectedFlow, isLoading, fetchFlows, fetchFlow, createFlow, updateFlow, deleteFlow } = useWhatsAppFlows()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showNodeModal, setShowNodeModal] = useState(false)
  const [editingNode, setEditingNode] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [nodeForm, setNodeForm] = useState({ type: 'MESSAGE', label: '', content: '', delay: 0, options: [''] })
  
  // Canvas state
  const [nodes, setNodes] = useState<any[]>([])
  const [edges, setEdges] = useState<any[]>([])
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => { fetchFlows() }, [])

  useEffect(() => {
    if (selectedFlow) {
      setNodes(selectedFlow.nodes || [])
      setEdges(selectedFlow.edges || [])
      setIsDirty(false)
    }
  }, [selectedFlow])

  const handleSelectFlow = async (flow: any) => {
    if (isDirty && !confirm('Descartar alterações não salvas?')) return
    await fetchFlow(flow.id)
  }

  const handleCreateFlow = async () => {
    if (!formData.name) return
    const flow = await createFlow(formData.name, { description: formData.description })
    setShowCreateModal(false); setFormData({ name: '', description: '' })
    setSelectedFlow(flow)
  }

  const handleSaveFlow = async () => {
    if (!selectedFlow) return
    await updateFlow(selectedFlow.id, { nodes, edges })
    setIsDirty(false)
  }

  const handleToggleActive = async () => {
    if (!selectedFlow) return
    await updateFlow(selectedFlow.id, { is_active: !selectedFlow.is_active })
  }

  const addNode = (type: string) => {
    const id = `node_${Date.now()}`
    const newNode = {
      id,
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + nodes.length * 120 },
      data: { label: nodeTypes.find(n => n.type === type)?.label || type, content: '' }
    }
    setNodes([...nodes, newNode])
    setIsDirty(true)
    setEditingNode(newNode)
    setNodeForm({ type, label: newNode.data.label, content: '', delay: 0, options: [''] })
    setShowNodeModal(true)
  }

  const updateNode = () => {
    if (!editingNode) return
    setNodes(nodes.map(n => n.id === editingNode.id ? {
      ...n,
      data: { ...n.data, label: nodeForm.label, content: nodeForm.content, delay: nodeForm.delay, options: nodeForm.options.filter(o => o) }
    } : n))
    setIsDirty(true)
    setShowNodeModal(false)
    setEditingNode(null)
  }

  const deleteNode = (id: string) => {
    setNodes(nodes.filter(n => n.id !== id))
    setEdges(edges.filter(e => e.source !== id && e.target !== id))
    setIsDirty(true)
  }

  const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-[calc(100vh-120px)] gap-6">
      {/* Sidebar - Flows */}
      <div className="w-80 flex-shrink-0 bg-slate-900/50 rounded-2xl border border-slate-800/50 flex flex-col">
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Fluxos</h2>
            <button onClick={() => setShowCreateModal(true)} className="p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Buscar fluxos..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm placeholder-slate-400 focus:outline-none focus:border-violet-500/50" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && flows.length === 0 ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
          ) : filteredFlows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500">
              <GitBranch className="w-10 h-10 mb-2 opacity-50" /><p className="text-sm">Nenhum fluxo</p>
            </div>
          ) : (
            filteredFlows.map(flow => (
              <button key={flow.id} onClick={() => handleSelectFlow(flow)}
                className={`w-full p-3 rounded-xl text-left transition-colors mb-2 ${selectedFlow?.id === flow.id ? 'bg-violet-600/20 border border-violet-500/30' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${flow.is_active ? 'bg-emerald-500/20' : 'bg-slate-800/50'}`}>
                    <GitBranch className={`w-4 h-4 ${flow.is_active ? 'text-emerald-400' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white truncate">{flow.name}</p>
                      {flow.is_active && <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded">ATIVO</span>}
                    </div>
                    <p className="text-xs text-slate-400">{(flow.nodes || []).length} nós</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main - Canvas */}
      <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800/50 flex flex-col overflow-hidden">
        {selectedFlow ? (
          <>
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">{selectedFlow.name}</h2>
                {isDirty && <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">Não salvo</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleToggleActive} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${selectedFlow.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/50 text-slate-400'}`}>
                  {selectedFlow.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {selectedFlow.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={handleSaveFlow} disabled={!isDirty} className="flex items-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-50">
                  <Save className="w-4 h-4" /> Salvar
                </button>
                <button onClick={() => deleteFlow(selectedFlow.id)} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Node Palette */}
            <div className="p-4 border-b border-slate-800/50 flex items-center gap-2 overflow-x-auto">
              <span className="text-sm text-slate-400 mr-2">Adicionar:</span>
              {nodeTypes.map(nt => (
                <button key={nt.type} onClick={() => addNode(nt.type)}
                  className={`flex items-center gap-2 px-3 py-2 bg-${nt.color}-500/10 text-${nt.color}-400 rounded-lg text-sm hover:bg-${nt.color}-500/20 whitespace-nowrap`}>
                  <nt.icon className="w-4 h-4" /> {nt.label}
                </button>
              ))}
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-auto p-6 bg-slate-950/30" style={{ backgroundImage: 'radial-gradient(circle, rgba(100,100,100,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              {nodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <GitBranch className="w-16 h-16 mb-4 opacity-50" />
                  <p className="mb-2">Fluxo vazio</p>
                  <p className="text-sm">Adicione nós usando a barra acima</p>
                </div>
              ) : (
                <div className="relative min-h-full">
                  {nodes.map((node, i) => {
                    const nodeType = nodeTypes.find(nt => nt.type === node.type) || nodeTypes[0]
                    return (
                      <motion.div key={node.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className={`absolute p-4 bg-slate-800/80 rounded-xl border-2 border-${nodeType.color}-500/50 w-64 cursor-move`}
                        style={{ left: node.position?.x || 100, top: node.position?.y || i * 120 }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg bg-${nodeType.color}-500/20`}>
                              <nodeType.icon className={`w-4 h-4 text-${nodeType.color}-400`} />
                            </div>
                            <span className="font-medium text-white text-sm">{node.data?.label || nodeType.label}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingNode(node); setNodeForm({ type: node.type, label: node.data?.label || '', content: node.data?.content || '', delay: node.data?.delay || 0, options: node.data?.options || [''] }); setShowNodeModal(true) }}
                              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white"><Settings className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteNode(node.id)} className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {node.data?.content && <p className="text-xs text-slate-400 truncate">{node.data.content}</p>}
                        {node.data?.delay > 0 && <p className="text-xs text-slate-400">{node.data.delay}s</p>}
                        {node.data?.options?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {node.data.options.map((opt: string, i: number) => (
                              <div key={i} className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300">{i + 1}. {opt}</div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <GitBranch className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Selecione ou crie um fluxo</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800/50" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-800/50"><h2 className="text-xl font-semibold text-white">Novo Fluxo</h2></div>
              <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Nome</label><input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Atendimento Inicial" className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50" /></div>
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Descrição</label><textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Descrição do fluxo" rows={3} className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50 resize-none" /></div>
              </div>
              <div className="p-6 border-t border-slate-800/50 flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700">Cancelar</button>
                <button onClick={handleCreateFlow} disabled={!formData.name} className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50">Criar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Node Edit Modal */}
      <AnimatePresence>
        {showNodeModal && editingNode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowNodeModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800/50" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-800/50"><h2 className="text-xl font-semibold text-white">Editar Nó</h2></div>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div><label className="block text-sm font-medium text-slate-300 mb-2">Título</label><input type="text" value={nodeForm.label} onChange={e => setNodeForm({ ...nodeForm, label: e.target.value })} className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50" /></div>
                {['MESSAGE', 'QUESTION'].includes(nodeForm.type) && (
                  <div><label className="block text-sm font-medium text-slate-300 mb-2">Conteúdo</label><textarea value={nodeForm.content} onChange={e => setNodeForm({ ...nodeForm, content: e.target.value })} rows={4} placeholder="Texto da mensagem..." className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50 resize-none" /></div>
                )}
                {nodeForm.type === 'DELAY' && (
                  <div><label className="block text-sm font-medium text-slate-300 mb-2">Tempo (segundos)</label><input type="number" value={nodeForm.delay} onChange={e => setNodeForm({ ...nodeForm, delay: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50" /></div>
                )}
                {nodeForm.type === 'QUESTION' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Opções de Resposta</label>
                    {nodeForm.options.map((opt, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input type="text" value={opt} onChange={e => { const opts = [...nodeForm.options]; opts[i] = e.target.value; setNodeForm({ ...nodeForm, options: opts }) }} placeholder={`Opção ${i + 1}`} className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-violet-500/50" />
                        {i > 0 && <button onClick={() => setNodeForm({ ...nodeForm, options: nodeForm.options.filter((_, idx) => idx !== i) })} className="p-2 text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>}
                      </div>
                    ))}
                    <button onClick={() => setNodeForm({ ...nodeForm, options: [...nodeForm.options, ''] })} className="text-sm text-violet-400 hover:text-violet-300">+ Adicionar opção</button>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-slate-800/50 flex gap-3">
                <button onClick={() => setShowNodeModal(false)} className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700">Cancelar</button>
                <button onClick={updateNode} className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700">Salvar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
