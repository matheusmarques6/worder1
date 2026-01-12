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
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Escolha o nicho do seu agente
        </h2>
        <p className="text-zinc-400">
          Selecione o template que mais se aproxima do seu negócio. Você poderá personalizar tudo depois.
        </p>
      </div>

      {/* Store Analysis Card */}
      {storeId && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`
            p-4 rounded-xl border
            ${storeAnalysis 
              ? 'bg-green-500/10 border-green-500/30' 
              : 'bg-zinc-800/50 border-zinc-700'
            }
          `}
        >
          <div className="flex items-start gap-4">
            <div className={`
              w-10 h-10 rounded-lg flex items-center justify-center
              ${storeAnalysis ? 'bg-green-500/20' : 'bg-blue-500/20'}
            `}>
              {storeAnalysis ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <Store className="w-5 h-5 text-blue-400" />
              )}
            </div>
            
            <div className="flex-1">
              {storeAnalysis ? (
                <>
                  <h3 className="font-medium text-white mb-1">
                    ✨ Análise concluída: {storeAnalysis.storeName}
                  </h3>
                  <p className="text-sm text-zinc-400 mb-2">
                    Detectamos o nicho <strong className="text-white">{storeAnalysis.detectedNiche}</strong> com {storeAnalysis.nicheConfidence}% de confiança.
                    {storeAnalysis.products.total} produtos encontrados.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 text-xs bg-zinc-700 rounded-full text-zinc-300">
                      {storeAnalysis.products.total} produtos
                    </span>
                    <span className="px-2 py-1 text-xs bg-zinc-700 rounded-full text-zinc-300">
                      {storeAnalysis.categories.length} categorias
                    </span>
                    <span className="px-2 py-1 text-xs bg-zinc-700 rounded-full text-zinc-300">
                      Score: {storeAnalysis.scores.overall}/100
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-medium text-white mb-1">
                    🔍 Analisar sua loja automaticamente
                  </h3>
                  <p className="text-sm text-zinc-400 mb-3">
                    Detectamos que você tem uma loja Shopify conectada. Podemos analisá-la para sugerir o melhor template e preencher informações automaticamente.
                  </p>
                  <button
                    onClick={onAnalyzeStore}
                    disabled={analyzingStore}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Buscar nicho..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {/* Suggested Template (from analysis) */}
      {storeAnalysis && storeAnalysis.suggestedTemplate && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-400" />
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
        <p className="text-sm text-zinc-400">
          {storeAnalysis ? 'Ou escolha outro nicho:' : 'Nichos disponíveis:'}
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
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
        <div className="pt-4 border-t border-zinc-700">
          <p className="text-sm text-zinc-400 mb-3">
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
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors"
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
