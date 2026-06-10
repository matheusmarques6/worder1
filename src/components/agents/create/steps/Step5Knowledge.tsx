'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  Upload,
  Link,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  File,
  RefreshCw,
} from 'lucide-react';
import type { NicheTemplate, SuggestedFAQ } from '@/lib/ai/templates';
import type { StoreAnalysis } from '@/types/store-analysis';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  enabled: boolean;
  isCustom?: boolean;
}

interface KnowledgeSource {
  id: string;
  name: string;
  source_type: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  chunks_count: number;
  file_size_bytes?: number;
  error_message?: string;
  created_at: string;
}

interface Step5KnowledgeProps {
  template: NicheTemplate;
  storeAnalysis: StoreAnalysis | null;
  faqItems: FAQItem[];
  onFAQChange: (items: FAQItem[]) => void;
  onNext: () => void;
  onBack: () => void;
  // NEW: para upload de arquivos
  draftAgentId?: string | null;
  organizationId?: string;
}

export function Step5Knowledge({
  template,
  storeAnalysis,
  faqItems,
  onFAQChange,
  onNext,
  onBack,
  draftAgentId,
  organizationId,
}: Step5KnowledgeProps) {
  // FAQ state
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [editingFAQ, setEditingFAQ] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ question: '', answer: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFAQ, setNewFAQ] = useState({ question: '', answer: '' });

  // Knowledge sources state
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<'faq' | 'files'>('faq');

  // Inicializar FAQ se vazio
  useEffect(() => {
    if (faqItems.length === 0) {
      const initialFAQ: FAQItem[] = storeAnalysis?.suggestedFAQ?.length
        ? storeAnalysis.suggestedFAQ.map((f, i) => ({
            id: `store-faq-${i}`,
            question: f.question,
            answer: f.answer,
            category: f.category,
            enabled: true,
            isCustom: false,
          }))
        : template.suggestedFAQ?.map((f) => ({
            id: f.id,
            question: f.question,
            answer: f.answer,
            category: f.category,
            enabled: f.enabled,
            isCustom: false,
          })) || [];
      
      onFAQChange(initialFAQ);
    }
  }, []);

  // Load sources when draftAgentId is available
  useEffect(() => {
    if (draftAgentId) {
      fetchSources();
    }
  }, [draftAgentId]);

  // Poll for processing status
  useEffect(() => {
    const processingSource = sources.find(s => s.status === 'processing' || s.status === 'pending');
    if (processingSource && draftAgentId) {
      const interval = setInterval(() => {
        fetchSources();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [sources, draftAgentId]);

  // Fetch sources from API
  const fetchSources = async () => {
    if (!draftAgentId) return;
    
    setLoadingSources(true);
    try {
      const res = await fetch(`/api/ai/agents/${draftAgentId}/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch (err) {
      console.error('Error fetching sources:', err);
    } finally {
      setLoadingSources(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!draftAgentId || !organizationId) {
      setUploadError('Erro: Agente ainda não foi criado. Tente voltar e avançar novamente.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('organization_id', organizationId);

        const res = await fetch(`/api/ai/agents/${draftAgentId}/sources/upload`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Erro ao fazer upload');
        }

        // Add to local state immediately
        if (data.source) {
          setSources(prev => [...prev, data.source]);
        }
      } catch (err: any) {
        setUploadError(err.message);
      }
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Delete source
  const deleteSource = async (sourceId: string) => {
    if (!draftAgentId) return;

    try {
      const res = await fetch(`/api/ai/agents/${draftAgentId}/sources/${sourceId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSources(prev => prev.filter(s => s.id !== sourceId));
      }
    } catch (err) {
      console.error('Error deleting source:', err);
    }
  };

  // Reprocess source
  const reprocessSource = async (sourceId: string) => {
    if (!draftAgentId) return;

    try {
      await fetch(`/api/ai/agents/${draftAgentId}/sources/${sourceId}/reprocess`, {
        method: 'POST',
      });
      fetchSources();
    } catch (err) {
      console.error('Error reprocessing source:', err);
    }
  };

  // FAQ functions
  const toggleFAQ = (id: string) => {
    onFAQChange(
      faqItems.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  const deleteFAQ = (id: string) => {
    onFAQChange(faqItems.filter((item) => item.id !== id));
  };

  const startEdit = (item: FAQItem) => {
    setEditingFAQ(item.id);
    setEditForm({ question: item.question, answer: item.answer });
  };

  const saveEdit = (id: string) => {
    onFAQChange(
      faqItems.map((item) =>
        item.id === id
          ? { ...item, question: editForm.question, answer: editForm.answer }
          : item
      )
    );
    setEditingFAQ(null);
  };

  const addFAQ = () => {
    if (!newFAQ.question.trim() || !newFAQ.answer.trim()) return;

    const newItem: FAQItem = {
      id: `custom-${Date.now()}`,
      question: newFAQ.question,
      answer: newFAQ.answer,
      category: 'general',
      enabled: true,
      isCustom: true,
    };

    onFAQChange([...faqItems, newItem]);
    setNewFAQ({ question: '', answer: '' });
    setShowAddForm(false);
  };

  // Category colors (scoped chip tones)
  const categoryColors: Record<string, string> = {
    shipping: 'chip chip-blue',
    returns: 'chip chip-brand',
    payment: 'chip chip-green',
    product: 'chip',
    general: 'chip',
    support: 'chip chip-red',
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <span className="chip chip-green">Pronto</span>;
      case 'processing':
        return <span className="chip chip-blue">
          <Loader2 className="w-3 h-3 animate-spin" /> Processando
        </span>;
      case 'pending':
        return <span className="chip" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }}>Pendente</span>;
      case 'error':
        return <span className="chip chip-red">Erro</span>;
      default:
        return null;
    }
  };

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const enabledCount = faqItems.filter((f) => f.enabled).length;
  const readySourcesCount = sources.filter(s => s.status === 'ready').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <Database />
        </div>
        <div>
          <h2 className="sec-t">Base de Conhecimento</h2>
          <p className="sec-s">
            Adicione FAQ e arquivos para seu agente consultar durante as conversas.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="kb-tabs">
        <button
          onClick={() => setActiveTab('faq')}
          className={`kb-tab ${activeTab === 'faq' ? 'on' : ''}`}
        >
          <Sparkles className="w-4 h-4" />
          FAQ ({enabledCount})
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`kb-tab ${activeTab === 'files' ? 'on' : ''}`}
        >
          <FileText className="w-4 h-4" />
          Arquivos ({readySourcesCount})
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'faq' ? (
          <motion.div
            key="faq"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
            {/* FAQ List */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {faqItems.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  className="faq-item"
                  style={item.enabled ? undefined : { opacity: 0.6 }}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleFAQ(item.id)}
                      className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{
                        border: '1px solid',
                        borderColor: item.enabled ? 'var(--brand)' : 'var(--border-strong)',
                        background: item.enabled ? 'var(--brand)' : 'transparent',
                      }}
                    >
                      {item.enabled && <Check className="w-3 h-3" style={{ color: "#fff" }} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      {editingFAQ === item.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editForm.question}
                            onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                            className="field"
                          />
                          <textarea
                            value={editForm.answer}
                            onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                            className="field"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(item.id)} className="btn btn-primary btn-sm">
                              Salvar
                            </button>
                            <button onClick={() => setEditingFAQ(null)} className="btn btn-soft btn-sm">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setExpandedFAQ(expandedFAQ === item.id ? null : item.id)}
                            className="w-full text-left"
                          >
                            <p className="faq-q">{item.question}</p>
                          </button>
                          <AnimatePresence>
                            {expandedFAQ === item.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                              >
                                <p className="faq-a">{item.answer}</p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <span className={categoryColors[item.category] || categoryColors.general}>
                        {item.category}
                      </span>
                      {editingFAQ !== item.id && (
                        <>
                          <button onClick={() => setExpandedFAQ(expandedFAQ === item.id ? null : item.id)} className="btn btn-soft btn-icon btn-sm">
                            {expandedFAQ === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <button onClick={() => startEdit(item)} className="btn btn-soft btn-icon btn-sm">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {item.isCustom && (
                            <button onClick={() => deleteFAQ(item.id)} className="btn btn-soft btn-icon btn-sm">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Add FAQ */}
            {showAddForm ? (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-3" style={{ padding: 16 }}>
                <input
                  type="text"
                  value={newFAQ.question}
                  onChange={(e) => setNewFAQ({ ...newFAQ, question: e.target.value })}
                  className="field"
                  placeholder="Digite a pergunta..."
                />
                <textarea
                  value={newFAQ.answer}
                  onChange={(e) => setNewFAQ({ ...newFAQ, answer: e.target.value })}
                  className="field"
                  rows={3}
                  placeholder="Digite a resposta..."
                />
                <div className="flex gap-2">
                  <button onClick={addFAQ} disabled={!newFAQ.question.trim() || !newFAQ.answer.trim()} className="btn btn-primary btn-sm">
                    Adicionar
                  </button>
                  <button onClick={() => { setShowAddForm(false); setNewFAQ({ question: '', answer: '' }); }} className="btn btn-soft btn-sm">
                    Cancelar
                  </button>
                </div>
              </motion.div>
            ) : (
              <button onClick={() => setShowAddForm(true)} className="kb-add">
                <Plus className="w-4 h-4" />
                Adicionar pergunta
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="files"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-4"
          >
            {/* Upload Area */}
            <div
              className="kb-add"
              style={uploading ? { borderColor: 'var(--brand)', background: 'var(--brand-tint)', padding: 24 } : { padding: 24 }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.doc,.docx,.csv"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                id="file-upload"
                disabled={uploading || !draftAgentId}
              />
              <label htmlFor="file-upload" className={`cursor-pointer text-center ${!draftAgentId ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {uploading ? (
                  <Loader2 className="w-10 h-10 mx-auto animate-spin mb-3" style={{ color: 'var(--brand)' }} />
                ) : (
                  <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-3)' }} />
                )}
                <p className="font-semibold" style={{ color: 'var(--text)' }}>
                  {uploading ? 'Enviando...' : 'Arraste arquivos ou clique para upload'}
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
                  PDF, TXT, DOC, DOCX, CSV (máx 25MB)
                </p>
              </label>
            </div>

            {/* Upload Error */}
            {uploadError && (
              <div className="callout red">
                <AlertCircle className="flex-shrink-0" />
                <p>{uploadError}</p>
              </div>
            )}

            {/* No Agent Warning */}
            {!draftAgentId && (
              <div className="callout amber">
                <AlertCircle className="flex-shrink-0" />
                <p>
                  O agente precisa ser criado antes de fazer upload de arquivos.
                  Isso acontecerá automaticamente ao passar pelo passo de Preview.
                </p>
              </div>
            )}

            {/* Sources List */}
            {sources.length > 0 && (
              <div className="space-y-2">
                <h4 className="label" style={{ marginBottom: 0 }}>Arquivos enviados</h4>
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="task-item"
                  >
                    <File className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{source.name}</p>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
                        {formatFileSize(source.file_size_bytes)}
                        {source.status === 'ready' && (
                          <span>• {source.chunks_count} chunks</span>
                        )}
                        {source.error_message && (
                          <span style={{ color: 'var(--red)' }}>• {source.error_message}</span>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(source.status)}
                    <div className="flex items-center gap-1">
                      {source.status === 'error' && (
                        <button
                          onClick={() => reprocessSource(source.id)}
                          className="btn btn-soft btn-icon btn-sm"
                          title="Reprocessar"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteSource(source.id)}
                        className="btn btn-soft btn-icon btn-sm"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {sources.length === 0 && draftAgentId && !loadingSources && (
              <div className="text-center py-6" style={{ color: 'var(--text-3)' }}>
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Nenhum arquivo enviado ainda</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="btn btn-ghost btn-lg"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>
        <button
          onClick={onNext}
          className="btn btn-primary btn-lg flex-1"
        >
          Próximo
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Step5Knowledge;
