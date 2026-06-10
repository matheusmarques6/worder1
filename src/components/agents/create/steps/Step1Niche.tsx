'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Sparkles, Store, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { NicheCard } from '../NicheCard';
import { ALL_TEMPLATES, NicheTemplate } from '@/lib/ai/templates';
import type { StoreAnalysis } from '@/types/store-analysis';

interface Step1NicheProps {
  selectedTemplate: NicheTemplate | null;
  onSelectTemplate: (template: NicheTemplate) => void;
  storeId?: string;
  storeAnalysis: StoreAnalysis | null;
  onAnalyzeStore: () => void;
  analyzingStore: boolean;
  onNext: () => void;
}

export function Step1Niche({
  selectedTemplate,
  onSelectTemplate,
  storeId,
  storeAnalysis,
  onAnalyzeStore,
  analyzingStore,
  onNext,
}: Step1NicheProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // Filtrar templates
  const filteredTemplates = ALL_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some((tag) => tag.includes(searchQuery.toLowerCase()))
  );

  // Templates principais (exceto custom)
  const mainTemplates = filteredTemplates.filter((t) => t.id !== 'custom');
  const customTemplate = filteredTemplates.find((t) => t.id === 'custom');

  // Templates a mostrar
  const templatesToShow = showAllTemplates ? mainTemplates : mainTemplates.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <Sparkles />
        </div>
        <div>
          <h2 className="sec-t">Escolha o nicho do seu agente</h2>
          <p className="sec-s">
            Selecione o template que mais se aproxima do seu negócio. Você poderá personalizar tudo depois.
          </p>
        </div>
      </div>

      {/* Store Analysis Card */}
      {storeId && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
          style={{ padding: 16 }}
        >
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${storeAnalysis ? 'chip-green' : 'chip-blue'}`}>
              {storeAnalysis ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <Store className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1">
              {storeAnalysis ? (
                <>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    ✨ Análise concluída: {storeAnalysis.storeName}
                  </h3>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-3)' }}>
                    Detectamos o nicho <strong style={{ color: 'var(--text)' }}>{storeAnalysis.detectedNiche}</strong> com {storeAnalysis.nicheConfidence}% de confiança.
                    {storeAnalysis.products.total} produtos encontrados.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="chip">{storeAnalysis.products.total} produtos</span>
                    <span className="chip">{storeAnalysis.categories.length} categorias</span>
                    <span className="chip">Score: {storeAnalysis.scores.overall}/100</span>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    🔍 Analisar sua loja automaticamente
                  </h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-3)' }}>
                    Detectamos que você tem uma loja Shopify conectada. Podemos analisá-la para sugerir o melhor template e preencher informações automaticamente.
                  </p>
                  <button
                    onClick={onAnalyzeStore}
                    disabled={analyzingStore}
                    className="btn btn-primary btn-sm"
                  >
                    {analyzingStore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Analisar minha loja
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Search */}
      <div className="search-field">
        <Search />
        <input
          type="text"
          placeholder="Buscar nicho..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="field"
        />
      </div>

      {/* Suggested Template (from analysis) */}
      {storeAnalysis && storeAnalysis.suggestedTemplate && (
        <div className="space-y-2">
          <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-3)' }}>
            <Sparkles className="w-4 h-4" style={{ color: 'var(--amber)' }} />
            Recomendado para sua loja:
          </p>
          {(() => {
            const suggested = ALL_TEMPLATES.find(t => t.id === storeAnalysis.suggestedTemplate);
            if (!suggested) return null;
            return (
              <NicheCard
                key={suggested.id}
                id={suggested.id}
                name={suggested.name}
                description={suggested.description}
                icon={suggested.icon}
                color={suggested.color}
                selected={selectedTemplate?.id === suggested.id}
                onClick={() => onSelectTemplate(suggested)}
              />
            );
          })()}
        </div>
      )}

      {/* Templates Grid */}
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          {storeAnalysis ? 'Ou escolha outro nicho:' : 'Nichos disponíveis:'}
        </p>

        <div className="niche-grid">
          {templatesToShow.map((template) => (
            <NicheCard
              key={template.id}
              id={template.id}
              name={template.name}
              description={template.description}
              icon={template.icon}
              color={template.color}
              selected={selectedTemplate?.id === template.id}
              onClick={() => onSelectTemplate(template)}
            />
          ))}
        </div>

        {/* Show more / less */}
        {mainTemplates.length > 6 && (
          <button
            onClick={() => setShowAllTemplates(!showAllTemplates)}
            className="text-sm font-semibold transition-colors"
            style={{ color: 'var(--brand-ink)' }}
          >
            {showAllTemplates
              ? 'Mostrar menos'
              : `Ver todos os ${mainTemplates.length} nichos`
            }
          </button>
        )}
      </div>

      {/* Custom Template */}
      {customTemplate && (
        <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-3)' }}>
            Ou comece do zero:
          </p>
          <NicheCard
            id={customTemplate.id}
            name={customTemplate.name}
            description={customTemplate.description}
            icon={customTemplate.icon}
            color={customTemplate.color}
            selected={selectedTemplate?.id === customTemplate.id}
            onClick={() => onSelectTemplate(customTemplate)}
          />
        </div>
      )}

      {/* Next Button */}
      <div className="pt-4">
        <button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="btn btn-primary btn-lg btn-block"
        >
          {selectedTemplate
            ? `Continuar com ${selectedTemplate.name}`
            : 'Selecione um nicho para continuar'
          }
        </button>
      </div>
    </div>
  );
}

export default Step1Niche;
