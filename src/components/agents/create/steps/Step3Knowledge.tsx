'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileText,
  Link,
  Edit2,
  Check,
  X,
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

interface Step3KnowledgeProps {
  template: NicheTemplate;
  storeAnalysis: StoreAnalysis | null;
  faqItems: FAQItem[];
  onFAQChange: (items: FAQItem[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step3Knowledge({
  template,
  storeAnalysis,
  faqItems,
  onFAQChange,
  onNext,
  onBack,
}: Step3KnowledgeProps) {
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [editingFAQ, setEditingFAQ] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ question: '', answer: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFAQ, setNewFAQ] = useState({ question: '', answer: '' });

  // Inicializar FAQ se vazio
  useState(() => {
    if (faqItems.length === 0) {
      // Usar FAQ da análise se disponível
      const initialFAQ: FAQItem[] = storeAnalysis?.suggestedFAQ?.length
        ? storeAnalysis.suggestedFAQ.map((f, i) => ({
            id: `store-faq-${i}`,
            question: f.question,
            answer: f.answer,
            category: f.category,
            enabled: true,
            isCustom: false,
          }))
        : template.suggestedFAQ.map((f) => ({
            id: f.id,
            question: f.question,
            answer: f.answer,
            category: f.category,
            enabled: f.enabled,
            isCustom: false,
          }));
      
      onFAQChange(initialFAQ);
    }
  });

  // Toggle FAQ enabled
  const toggleFAQ = (id: string) => {
    onFAQChange(
      faqItems.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  // Delete FAQ
  const deleteFAQ = (id: string) => {
    onFAQChange(faqItems.filter((item) => item.id !== id));
  };

  // Start editing
  const startEdit = (item: FAQItem) => {
    setEditingFAQ(item.id);
    setEditForm({ question: item.question, answer: item.answer });
  };

  // Save edit
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

  // Add new FAQ
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

  // Category colors
  const categoryColors: Record<string, string> = {
    shipping: 'bg-blue-500/20 text-blue-400',
    returns: 'bg-orange-500/20 text-orange-400',
    payment: 'bg-green-500/20 text-green-400',
    product: 'bg-purple-500/20 text-purple-400',
    general: 'bg-zinc-500/20 text-zinc-400',
    support: 'bg-red-500/20 text-red-400',
  };

  const enabledCount = faqItems.filter((f) => f.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Base de Conhecimento
        </h2>
        <p className="text-zinc-400">
          Configure as perguntas frequentes que seu agente saberá responder.
          {storeAnalysis && ' Geramos um FAQ baseado na sua loja.'}
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          <span className="text-white font-medium">{enabledCount}</span>
          <span className="text-zinc-400">perguntas ativas</span>
        </div>
        {storeAnalysis && (
          <div className="flex items-center gap-2 ml-auto">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-zinc-400">Gerado automaticamente</span>
          </div>
        )}
      </div>

      {/* FAQ List */}
      <div className="space-y-2">
        {faqItems.map((item) => (
          <motion.div
            key={item.id}
            layout
            className={`
              border rounded-lg overflow-hidden transition-colors
              ${item.enabled
                ? 'bg-zinc-800/50 border-zinc-700'
                : 'bg-zinc-900/50 border-zinc-800 opacity-60'
              }
            `}
          >
            {/* FAQ Header */}
            <div className="p-3 flex items-start gap-3">
              {/* Checkbox */}
              <button
                onClick={() => toggleFAQ(item.id)}
                className={`
                  w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5
                  ${item.enabled
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-transparent border-zinc-600'
                  }
                `}
              >
                {item.enabled && <Check className="w-3 h-3 text-white" />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {editingFAQ === item.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm.question}
                      onChange={(e) =>
                        setEditForm({ ...editForm, question: e.target.value })
                      }
                      className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white text-sm"
                      placeholder="Pergunta"
                    />
                    <textarea
                      value={editForm.answer}
                      onChange={(e) =>
                        setEditForm({ ...editForm, answer: e.target.value })
                      }
                      className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white text-sm resize-none"
                      rows={2}
                      placeholder="Resposta"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditingFAQ(null)}
                        className="px-2 py-1 bg-zinc-700 text-white text-xs rounded"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        setExpandedFAQ(expandedFAQ === item.id ? null : item.id)
                      }
                      className="w-full text-left"
                    >
                      <p className="text-sm font-medium text-white">
                        {item.question}
                      </p>
                    </button>

                    {/* Expanded answer */}
                    <AnimatePresence>
                      {expandedFAQ === item.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2"
                        >
                          <p className="text-sm text-zinc-400">{item.answer}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    categoryColors[item.category] || categoryColors.general
                  }`}
                >
                  {item.category}
                </span>
                
                {editingFAQ !== item.id && (
                  <>
                    <button
                      onClick={() =>
                        setExpandedFAQ(expandedFAQ === item.id ? null : item.id)
                      }
                      className="p-1 text-zinc-500 hover:text-white"
                    >
                      {expandedFAQ === item.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1 text-zinc-500 hover:text-white"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {item.isCustom && (
                      <button
                        onClick={() => deleteFAQ(item.id)}
                        className="p-1 text-zinc-500 hover:text-red-400"
                      >
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

      {/* Add New FAQ */}
      {showAddForm ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-zinc-800 border border-zinc-700 rounded-lg space-y-3"
        >
          <input
            type="text"
            value={newFAQ.question}
            onChange={(e) => setNewFAQ({ ...newFAQ, question: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500"
            placeholder="Digite a pergunta..."
          />
          <textarea
            value={newFAQ.answer}
            onChange={(e) => setNewFAQ({ ...newFAQ, answer: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 resize-none"
            rows={3}
            placeholder="Digite a resposta..."
          />
          <div className="flex gap-2">
            <button
              onClick={addFAQ}
              disabled={!newFAQ.question.trim() || !newFAQ.answer.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg"
            >
              Adicionar
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewFAQ({ question: '', answer: '' });
              }}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg"
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full p-3 border border-dashed border-zinc-700 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Adicionar pergunta
        </button>
      )}

      {/* Future: Knowledge Sources */}
      <div className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Em breve</h3>
        <div className="flex gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            Upload de arquivos
          </div>
          <div className="flex items-center gap-1">
            <Link className="w-4 h-4" />
            Importar de URL
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

export default Step3Knowledge;
