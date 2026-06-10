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
            <label className="label">
              {field.label}
              {field.required && <span className="ml-1" style={{ color: 'var(--red)' }}>*</span>}
            </label>
            <textarea
              value={value}
              onChange={(e) => updateField(field.id, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              className="field"
              style={error ? { borderColor: 'var(--red)' } : undefined}
            />
            {field.helpText && !error && (
              <p className="hint">{field.helpText}</p>
            )}
            {error && <p className="hint" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>
        );

      case 'select':
        return (
          <div key={field.id} className="space-y-1.5">
            <label className="label">
              {field.label}
              {field.required && <span className="ml-1" style={{ color: 'var(--red)' }}>*</span>}
            </label>
            <select
              value={value}
              onChange={(e) => updateField(field.id, e.target.value)}
              className="field"
            >
              <option value="">Selecione...</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {field.helpText && <p className="hint">{field.helpText}</p>}
          </div>
        );

      default:
        return (
          <div key={field.id} className="space-y-1.5">
            <label className="label">
              {field.label}
              {field.required && <span className="ml-1" style={{ color: 'var(--red)' }}>*</span>}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => updateField(field.id, e.target.value)}
              placeholder={field.placeholder}
              className="field"
              style={error ? { borderColor: 'var(--red)' } : undefined}
            />
            {field.helpText && !error && (
              <p className="hint">{field.helpText}</p>
            )}
            {error && <p className="hint" style={{ color: 'var(--red)' }}>{error}</p>}
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
      <div className="sec-head">
        <div className="sec-ico">
          <Info />
        </div>
        <div>
          <h2 className="sec-t">Personalize seu agente</h2>
          <p className="sec-s">
            Configure as informações do seu agente de {template.name}.
            {storeAnalysis && ' Preenchemos alguns campos com base na análise da sua loja.'}
          </p>
        </div>
      </div>

      {/* Auto-filled notice */}
      {storeAnalysis && (
        <div className="callout blue">
          <Info className="flex-shrink-0" />
          <p>
            Campos preenchidos automaticamente com dados da sua loja. Você pode editar qualquer informação.
          </p>
        </div>
      )}

      {/* Required Fields */}
      <div className="space-y-4">
        <h3 className="label uppercase" style={{ marginBottom: 0 }}>
          Informações Básicas
        </h3>
        {requiredFields.map(renderField)}
      </div>

      {/* Tone Selection */}
      <div className="space-y-3">
        <h3 className="label uppercase" style={{ marginBottom: 0 }}>
          Tom de Voz
        </h3>
        <div className="tone-grid">
          {(Object.entries(TONE_OPTIONS) as [string, typeof TONE_OPTIONS[keyof typeof TONE_OPTIONS]][]).map(([key, option]) => (
            <button
              key={key}
              onClick={() => onPersonaChange({ ...persona, tone: key as any })}
              className={`tone ${persona.tone === key ? 'on' : ''}`}
            >
              <div className="tone-emo">{option.icon}</div>
              <div className="tone-t">{option.label}</div>
              <div className="tone-d">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Response Length */}
      <div className="space-y-3">
        <h3 className="label uppercase" style={{ marginBottom: 0 }}>
          Tamanho das Respostas
        </h3>
        <div className="seg">
          {(Object.entries(RESPONSE_LENGTH_OPTIONS) as [string, typeof RESPONSE_LENGTH_OPTIONS[keyof typeof RESPONSE_LENGTH_OPTIONS]][]).map(([key, option]) => (
            <button
              key={key}
              onClick={() => onPersonaChange({ ...persona, responseLength: key as any })}
              className={`selcard ${persona.responseLength === key ? 'on' : ''}`}
              style={{ textAlign: 'center' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{option.label}</div>
              <div className="text-xs" style={{ color: 'var(--text-3)' }}>{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Optional Fields (Advanced) */}
      {optionalFields.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-semibold transition-colors"
            style={{ color: 'var(--text-2)' }}
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
                <label className="label">
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
                  className="field"
                  style={{ width: 96 }}
                />
                <p className="hint">
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
          className="btn btn-ghost btn-lg"
        >
          Voltar
        </button>
        <button
          onClick={handleNext}
          className="btn btn-primary btn-lg flex-1"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

export default Step2Personalize;
