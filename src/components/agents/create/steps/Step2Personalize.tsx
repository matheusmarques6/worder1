'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import type { NicheTemplate, CustomField } from '@/lib/ai/templates';
import { TONE_OPTIONS, RESPONSE_LENGTH_OPTIONS } from '@/lib/ai/templates/types';
import type { StoreAnalysis } from '@/types/store-analysis';

interface Step2PersonalizeProps {
  template: NicheTemplate;
  storeAnalysis: StoreAnalysis | null;
  formData: Record<string, string>;
  onFormDataChange: (data: Record<string, string>) => void;
  persona: {
    tone: 'casual' | 'friendly' | 'professional' | 'luxury';
    responseLength: 'short' | 'medium' | 'long';
    replyDelay: number;
  };
  onPersonaChange: (persona: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2Personalize({
  template,
  storeAnalysis,
  formData,
  onFormDataChange,
  persona,
  onPersonaChange,
  onNext,
  onBack,
}: Step2PersonalizeProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Preencher automaticamente com dados da análise
  useEffect(() => {
    if (storeAnalysis && Object.keys(formData).length === 0) {
      const autoFilled: Record<string, string> = {
        storeName: storeAnalysis.storeName,
        storeDescription: storeAnalysis.storeDescription || '',
        mainEmoji: storeAnalysis.branding?.suggestedEmojis?.[0] || template.persona.emojis[0] || '😊',
      };
      
      // Definir tom baseado na análise
      if (storeAnalysis.branding?.tone) {
        onPersonaChange({ ...persona, tone: storeAnalysis.branding.tone });
      }
      
      onFormDataChange(autoFilled);
    }
  }, [storeAnalysis]);

  // Atualizar campo do formulário
  const updateField = (fieldId: string, value: string) => {
    onFormDataChange({ ...formData, [fieldId]: value });
    // Limpar erro ao editar
    if (errors[fieldId]) {
      setErrors({ ...errors, [fieldId]: '' });
    }
  };

  // Validar antes de continuar
  const handleNext = () => {
    const newErrors: Record<string, string> = {};
    
    template.customFields.forEach((field) => {
      if (field.required && !formData[field.id]?.trim()) {
        newErrors[field.id] = `${field.label} é obrigatório`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onNext();
  };

  // Renderizar campo baseado no tipo
  const renderField = (field: CustomField) => {
    const value = formData[field.id] || field.defaultValue || '';
    const error = errors[field.id];

    switch (field.type) {
      case 'textarea':
        return (
          <div key={field.id} className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              {field.label}
              {field.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <textarea
              value={value}
              onChange={(e) => updateField(field.id, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              className={`
                w-full px-3 py-2 bg-zinc-800 border rounded-lg text-white placeholder-zinc-500
                focus:outline-none focus:border-blue-500 resize-none
                ${error ? 'border-red-500' : 'border-zinc-700'}
              `}
            />
            {field.helpText && !error && (
              <p className="text-xs text-zinc-500">{field.helpText}</p>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        );

      case 'select':
        return (
          <div key={field.id} className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              {field.label}
              {field.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <select
              value={value}
              onChange={(e) => updateField(field.id, e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Selecione...</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {field.helpText && <p className="text-xs text-zinc-500">{field.helpText}</p>}
          </div>
        );

      default:
        return (
          <div key={field.id} className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              {field.label}
              {field.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => updateField(field.id, e.target.value)}
              placeholder={field.placeholder}
              className={`
                w-full px-3 py-2 bg-zinc-800 border rounded-lg text-white placeholder-zinc-500
                focus:outline-none focus:border-blue-500
                ${error ? 'border-red-500' : 'border-zinc-700'}
              `}
            />
            {field.helpText && !error && (
              <p className="text-xs text-zinc-500">{field.helpText}</p>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        );
    }
  };

  // Campos obrigatórios primeiro
  const requiredFields = template.customFields.filter((f) => f.required);
  const optionalFields = template.customFields.filter((f) => !f.required);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Personalize seu agente
        </h2>
        <p className="text-zinc-400">
          Configure as informações do seu agente de {template.name}.
          {storeAnalysis && ' Preenchemos alguns campos com base na análise da sua loja.'}
        </p>
      </div>

      {/* Auto-filled notice */}
      {storeAnalysis && (
        <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-300">
            Campos preenchidos automaticamente com dados da sua loja. Você pode editar qualquer informação.
          </p>
        </div>
      )}

      {/* Required Fields */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
          Informações Básicas
        </h3>
        {requiredFields.map(renderField)}
      </div>

      {/* Tone Selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
          Tom de Voz
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(Object.entries(TONE_OPTIONS) as [string, typeof TONE_OPTIONS[keyof typeof TONE_OPTIONS]][]).map(([key, option]) => (
            <button
              key={key}
              onClick={() => onPersonaChange({ ...persona, tone: key as any })}
              className={`
                p-3 rounded-lg border text-left transition-all
                ${persona.tone === key
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                }
              `}
            >
              <span className="text-lg mb-1 block">{option.icon}</span>
              <span className="text-sm font-medium text-white block">{option.label}</span>
              <span className="text-xs text-zinc-400">{option.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Response Length */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
          Tamanho das Respostas
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(RESPONSE_LENGTH_OPTIONS) as [string, typeof RESPONSE_LENGTH_OPTIONS[keyof typeof RESPONSE_LENGTH_OPTIONS]][]).map(([key, option]) => (
            <button
              key={key}
              onClick={() => onPersonaChange({ ...persona, responseLength: key as any })}
              className={`
                p-3 rounded-lg border text-center transition-all
                ${persona.responseLength === key
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                }
              `}
            >
              <span className="text-sm font-medium text-white block">{option.label}</span>
              <span className="text-xs text-zinc-400">{option.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Optional Fields (Advanced) */}
      {optionalFields.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {showAdvanced ? 'Ocultar' : 'Mostrar'} configurações avançadas
          </button>

          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-2"
            >
              {optionalFields.map(renderField)}

              {/* Reply Delay */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-300">
                  Tempo de resposta (segundos)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={persona.replyDelay}
                  onChange={(e) =>
                    onPersonaChange({ ...persona, replyDelay: parseInt(e.target.value) || 0 })
                  }
                  className="w-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-zinc-500">
                  Tempo que o agente "digita" antes de responder (0-30s)
                </p>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={handleNext}
          className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

export default Step2Personalize;
