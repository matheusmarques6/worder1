'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MessageCircle,
  FileText,
  Image as ImageIcon,
  Video,
  File,
  ChevronDown,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  Copy,
  AlertCircle,
  Info,
  Smartphone,
  Send,
  Link2,
  ShoppingCart,
  Package,
  Truck,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VariablePicker } from '../variables/VariablePicker';
import { extractVariablesFromText } from '../variables/variableDefinitions';

// ============================================
// TYPES
// ============================================

interface WhatsAppConfig {
  messageMode: 'free' | 'template'; // Livre ou Modelo
  // Template mode fields
  templateName?: string;
  templateCategory?: string;
  templateType?: string;
  language?: string;
  // Header
  headerType?: 'none' | 'text' | 'image' | 'video' | 'document';
  headerText?: string;
  headerMediaUrl?: string;
  // Body
  bodyText?: string;
  // Footer
  footerText?: string;
  // Buttons
  buttons?: WhatsAppButton[];
  // Template variables (ordered list)
  templateVariables?: string[];
  // Free text mode
  message?: string;
}

interface WhatsAppButton {
  type: 'url' | 'phone' | 'quick_reply';
  text: string;
  value?: string; // URL or phone number
}

interface WhatsAppTemplateEditorProps {
  config: WhatsAppConfig;
  onConfigChange: (config: WhatsAppConfig) => void;
  triggerType: string;
  onClose?: () => void;
  isModal?: boolean;
}

// ============================================
// TEMPLATE TYPES (Pre-defined templates)
// ============================================

const TEMPLATE_TYPES = [
  { value: 'none', label: 'Modelo em branco', icon: FileText, description: 'Crie do zero' },
  { value: 'abandoned_cart', label: 'Carrinho abandonado', icon: ShoppingCart, description: 'Recupere vendas' },
  { value: 'order_confirmation', label: 'Confirmação de pedido', icon: Package, description: 'Confirme compras' },
  { value: 'shipping_update', label: 'Atualização de envio', icon: Truck, description: 'Código de rastreio' },
  { value: 'quick_reply', label: 'Respostas rápidas', icon: MessageSquare, description: 'Atendimento rápido' },
  { value: 'welcome', label: 'Boas-vindas', icon: Zap, description: 'Novos contatos' },
];

const TEMPLATE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'utility', label: 'Utilidade' },
  { value: 'authentication', label: 'Autenticação' },
];

const LANGUAGES = [
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'es', label: 'Español' },
];

// ============================================
// TEMPLATE PRESETS
// ============================================

const TEMPLATE_PRESETS: Record<string, Partial<WhatsAppConfig>> = {
  abandoned_cart: {
    templateCategory: 'marketing',
    headerType: 'text',
    headerText: '🛒 Você esqueceu algo!',
    bodyText: 'Olá {{ contact.first_name }}!\n\nVocê deixou itens no seu carrinho. Complete sua compra agora e garanta seus produtos!\n\n🛍️ Valor total: {{ event.total_value }}\n\n👉 Finalize aqui: {{ event.cart_url }}',
    footerText: 'Responda SAIR para não receber mais mensagens',
    buttons: [
      { type: 'url', text: 'Finalizar Compra', value: '{{ event.cart_url }}' },
    ],
  },
  order_confirmation: {
    templateCategory: 'utility',
    headerType: 'text',
    headerText: '✅ Pedido Confirmado!',
    bodyText: 'Olá {{ contact.first_name }}!\n\nSeu pedido {{ event.order_id }} foi confirmado com sucesso!\n\n💰 Valor: {{ event.total_value }}\n📦 Status: {{ event.order_status }}\n\nAcompanhe seu pedido pelo link abaixo.',
    footerText: 'Obrigado por comprar conosco!',
    buttons: [
      { type: 'url', text: 'Acompanhar Pedido', value: '{{ event.tracking_url }}' },
    ],
  },
  shipping_update: {
    templateCategory: 'utility',
    headerType: 'text',
    headerText: '📦 Seu pedido está a caminho!',
    bodyText: 'Olá {{ contact.first_name }}!\n\nÓtimas notícias! Seu pedido {{ event.order_id }} foi enviado.\n\n🚚 Código de rastreio: {{ event.tracking_code }}\n📍 Previsão de entrega: 3-5 dias úteis\n\nAcompanhe a entrega em tempo real:',
    footerText: '',
    buttons: [
      { type: 'url', text: 'Rastrear Pedido', value: '{{ event.tracking_url }}' },
    ],
  },
  quick_reply: {
    templateCategory: 'utility',
    headerType: 'none',
    bodyText: 'Olá {{ contact.first_name }}! Como posso ajudar você hoje?\n\nEscolha uma das opções abaixo:',
    footerText: '',
    buttons: [
      { type: 'quick_reply', text: '💬 Falar com atendente' },
      { type: 'quick_reply', text: '📦 Status do pedido' },
      { type: 'quick_reply', text: '❓ Dúvidas frequentes' },
    ],
  },
  welcome: {
    templateCategory: 'marketing',
    headerType: 'text',
    headerText: '👋 Bem-vindo(a)!',
    bodyText: 'Olá {{ contact.first_name }}! Que bom ter você aqui! 🎉\n\nAgora você faz parte da nossa família. Fique por dentro de todas as novidades e ofertas exclusivas.\n\nComo posso ajudar?',
    footerText: 'Responda a qualquer momento',
    buttons: [
      { type: 'quick_reply', text: '🛍️ Ver produtos' },
      { type: 'quick_reply', text: '💬 Falar com alguém' },
    ],
  },
};

// ============================================
// MAIN COMPONENT
// ============================================

export function WhatsAppTemplateEditor({
  config,
  onConfigChange,
  triggerType,
  onClose,
  isModal = true,
}: WhatsAppTemplateEditorProps) {
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [activeField, setActiveField] = useState<string>('');
  const [showPreview, setShowPreview] = useState(true);

  // Default config
  const currentConfig: WhatsAppConfig = {
    messageMode: 'free',
    templateCategory: 'marketing',
    headerType: 'none',
    language: 'pt_BR',
    buttons: [],
    templateVariables: [],
    ...config,
  };

  const handleUpdate = useCallback((updates: Partial<WhatsAppConfig>) => {
    onConfigChange({ ...currentConfig, ...updates });
  }, [currentConfig, onConfigChange]);

  const handleInsertVariable = useCallback((variable: string) => {
    if (!activeField) return;

    const fieldMap: Record<string, keyof WhatsAppConfig> = {
      'header': 'headerText',
      'body': 'bodyText',
      'footer': 'footerText',
      'message': 'message',
    };

    const field = fieldMap[activeField];
    if (field) {
      const currentValue = (currentConfig[field] as string) || '';
      handleUpdate({ [field]: currentValue + variable });
    }

    setShowVariablePicker(false);
  }, [activeField, currentConfig, handleUpdate]);

  const handleTemplateTypeChange = (type: string) => {
    if (type === 'none') {
      handleUpdate({
        templateType: type,
        headerType: 'none',
        headerText: '',
        bodyText: '',
        footerText: '',
        buttons: [],
      });
    } else {
      const preset = TEMPLATE_PRESETS[type];
      if (preset) {
        handleUpdate({
          templateType: type,
          ...preset,
        });
      }
    }
  };

  const handleAddButton = () => {
    const buttons = currentConfig.buttons || [];
    if (buttons.length < 3) {
      handleUpdate({
        buttons: [...buttons, { type: 'quick_reply', text: '' }],
      });
    }
  };

  const handleUpdateButton = (index: number, updates: Partial<WhatsAppButton>) => {
    const buttons = [...(currentConfig.buttons || [])];
    buttons[index] = { ...buttons[index], ...updates };
    handleUpdate({ buttons });
  };

  const handleRemoveButton = (index: number) => {
    const buttons = (currentConfig.buttons || []).filter((_, i) => i !== index);
    handleUpdate({ buttons });
  };

  // Count variables in text
  const variableCount = useMemo(() => {
    const allText = [
      currentConfig.headerText,
      currentConfig.bodyText,
      currentConfig.footerText,
      currentConfig.message,
    ].filter(Boolean).join(' ');
    return extractVariablesFromText(allText).length;
  }, [currentConfig]);

  const content = (
    <div className="flex flex-col lg:flex-row h-full max-h-[90vh] overflow-hidden">
      {/* Left Panel - Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700 bg-dark-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <MessageCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Editor de Mensagem WhatsApp</h2>
              <p className="text-xs text-dark-400">Configure sua mensagem para envio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                'p-2 rounded-lg transition-colors lg:hidden',
                showPreview ? 'bg-green-500/20 text-green-400' : 'hover:bg-dark-700 text-dark-400'
              )}
            >
              {showPreview ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Mode Selector */}
        <div className="p-4 border-b border-dark-700 bg-dark-800/50">
          <div className="flex gap-2">
            <button
              onClick={() => handleUpdate({ messageMode: 'free' })}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all',
                'border-2',
                currentConfig.messageMode === 'free'
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : 'border-dark-600 hover:border-dark-500 text-dark-300 hover:text-white'
              )}
            >
              <MessageSquare className="w-4 h-4" />
              <div className="text-left">
                <div className="text-sm font-medium">Livre</div>
                <div className="text-[10px] opacity-70">API não-oficial</div>
              </div>
            </button>
            <button
              onClick={() => handleUpdate({ messageMode: 'template' })}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all',
                'border-2',
                currentConfig.messageMode === 'template'
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : 'border-dark-600 hover:border-dark-500 text-dark-300 hover:text-white'
              )}
            >
              <FileText className="w-4 h-4" />
              <div className="text-left">
                <div className="text-sm font-medium">Modelo</div>
                <div className="text-[10px] opacity-70">API oficial</div>
              </div>
            </button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {currentConfig.messageMode === 'free' ? (
            // FREE TEXT MODE
            <FreeTextEditor
              config={currentConfig}
              onUpdate={handleUpdate}
              onOpenVariables={(field) => {
                setActiveField(field);
                setShowVariablePicker(true);
              }}
            />
          ) : (
            // TEMPLATE MODE
            <TemplateEditor
              config={currentConfig}
              onUpdate={handleUpdate}
              onTemplateTypeChange={handleTemplateTypeChange}
              onOpenVariables={(field) => {
                setActiveField(field);
                setShowVariablePicker(true);
              }}
              onAddButton={handleAddButton}
              onUpdateButton={handleUpdateButton}
              onRemoveButton={handleRemoveButton}
            />
          )}

          {/* Variables count */}
          {variableCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500/10 border border-primary-500/20">
              <Sparkles className="w-4 h-4 text-primary-400" />
              <span className="text-xs text-primary-300">
                {variableCount} {variableCount === 1 ? 'variável' : 'variáveis'} de personalização
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {isModal && (
          <div className="p-4 border-t border-dark-700 bg-dark-900 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
            >
              <Check className="w-4 h-4" />
              Salvar Mensagem
            </button>
          </div>
        )}
      </div>

      {/* Right Panel - Phone Preview */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-dark-700 bg-dark-800/50 flex-shrink-0 overflow-hidden hidden lg:block"
          >
            <PhonePreview config={currentConfig} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Variable Picker Modal */}
      <AnimatePresence>
        {showVariablePicker && (
          <VariablePicker
            triggerType={triggerType}
            onSelect={handleInsertVariable}
            onClose={() => setShowVariablePicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );

  if (isModal) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl h-[90vh] bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-2xl"
        >
          {content}
        </motion.div>
      </motion.div>
    );
  }

  return content;
}

// ============================================
// FREE TEXT EDITOR
// ============================================

interface FreeTextEditorProps {
  config: WhatsAppConfig;
  onUpdate: (updates: Partial<WhatsAppConfig>) => void;
  onOpenVariables: (field: string) => void;
}

function FreeTextEditor({ config, onUpdate, onOpenVariables }: FreeTextEditorProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-xs text-amber-300 font-medium">Modo Texto Livre</p>
            <p className="text-[11px] text-amber-300/70">
              Este modo funciona com APIs não-oficiais (Evolution, Baileys, etc).
              Você pode enviar qualquer mensagem sem aprovação prévia.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-white/60">Mensagem</label>
          <button
            onClick={() => onOpenVariables('message')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs font-medium transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Personalizar
          </button>
        </div>
        <textarea
          value={config.message || ''}
          onChange={(e) => onUpdate({ message: e.target.value })}
          placeholder="Olá {{ contact.first_name }}! Como posso ajudar você hoje?"
          rows={8}
          className={cn(
            'w-full px-3 py-3 rounded-lg resize-none',
            'bg-[#0a0a0a] border border-white/10',
            'text-sm text-white placeholder-white/30',
            'focus:outline-none focus:border-green-500/50 focus:ring-2 focus:ring-green-500/20',
            'transition-all'
          )}
        />
        <p className="text-[10px] text-white/40">
          Use variáveis como <code className="bg-dark-700 px-1 rounded">{'{{ contact.first_name }}'}</code> para personalizar
        </p>
      </div>

      {/* Media attachment */}
      <div className="space-y-2">
        <label className="text-xs text-white/60">Anexar mídia (opcional)</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { type: 'none', icon: X, label: 'Nenhum' },
            { type: 'image', icon: ImageIcon, label: 'Imagem' },
            { type: 'video', icon: Video, label: 'Vídeo' },
            { type: 'document', icon: File, label: 'Arquivo' },
          ].map((item) => (
            <button
              key={item.type}
              onClick={() => onUpdate({ headerType: item.type as any })}
              className={cn(
                'flex flex-col items-center gap-1 p-3 rounded-lg border transition-all',
                config.headerType === item.type
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : 'border-dark-600 hover:border-dark-500 text-dark-400 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {config.headerType && config.headerType !== 'none' && (
        <div className="space-y-2">
          <label className="text-xs text-white/60">URL da Mídia</label>
          <input
            type="url"
            value={config.headerMediaUrl || ''}
            onChange={(e) => onUpdate({ headerMediaUrl: e.target.value })}
            placeholder="https://exemplo.com/imagem.jpg"
            className={cn(
              'w-full px-3 py-2 rounded-lg',
              'bg-[#0a0a0a] border border-white/10',
              'text-sm text-white placeholder-white/30',
              'focus:outline-none focus:border-green-500/50'
            )}
          />
        </div>
      )}
    </div>
  );
}

// ============================================
// TEMPLATE EDITOR
// ============================================

interface TemplateEditorProps {
  config: WhatsAppConfig;
  onUpdate: (updates: Partial<WhatsAppConfig>) => void;
  onTemplateTypeChange: (type: string) => void;
  onOpenVariables: (field: string) => void;
  onAddButton: () => void;
  onUpdateButton: (index: number, updates: Partial<WhatsAppButton>) => void;
  onRemoveButton: (index: number) => void;
}

function TemplateEditor({
  config,
  onUpdate,
  onTemplateTypeChange,
  onOpenVariables,
  onAddButton,
  onUpdateButton,
  onRemoveButton,
}: TemplateEditorProps) {
  return (
    <div className="space-y-5">
      {/* Info */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-xs text-blue-300 font-medium">Modo Template (API Oficial)</p>
            <p className="text-[11px] text-blue-300/70">
              Templates precisam ser aprovados pela Meta antes do envio.
              Use este modo para mensagens fora da janela de 24h.
            </p>
          </div>
        </div>
      </div>

      {/* Template Type Selection */}
      <div className="space-y-2">
        <label className="text-xs text-white/60">Tipo de Template</label>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => onTemplateTypeChange(type.value)}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all',
                config.templateType === type.value
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-dark-600 hover:border-dark-500'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-lg',
                config.templateType === type.value ? 'bg-green-500/20' : 'bg-dark-700'
              )}>
                <type.icon className={cn(
                  'w-4 h-4',
                  config.templateType === type.value ? 'text-green-400' : 'text-dark-400'
                )} />
              </div>
              <div>
                <div className={cn(
                  'text-xs font-medium',
                  config.templateType === type.value ? 'text-green-400' : 'text-white'
                )}>
                  {type.label}
                </div>
                <div className="text-[10px] text-dark-400">{type.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Template Name */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs text-white/60">Nome do Template</label>
          <input
            type="text"
            value={config.templateName || ''}
            onChange={(e) => onUpdate({ templateName: e.target.value.toLowerCase().replace(/\s/g, '_') })}
            placeholder="carrinho_abandonado_v1"
            className={cn(
              'w-full px-3 py-2 rounded-lg',
              'bg-[#0a0a0a] border border-white/10',
              'text-sm text-white placeholder-white/30',
              'focus:outline-none focus:border-green-500/50'
            )}
          />
          <p className="text-[10px] text-white/40">Apenas letras minúsculas e _</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-white/60">Categoria</label>
          <SelectField
            value={config.templateCategory || 'marketing'}
            onChange={(v) => onUpdate({ templateCategory: v })}
            options={TEMPLATE_CATEGORIES}
          />
        </div>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-xs text-white/60">Idioma</label>
        <SelectField
          value={config.language || 'pt_BR'}
          onChange={(v) => onUpdate({ language: v })}
          options={LANGUAGES}
        />
      </div>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-white/60 font-medium">Cabeçalho</label>
          <span className="text-[10px] text-dark-500">Opcional</span>
        </div>
        <div className="flex gap-2">
          {[
            { type: 'none', label: 'Nenhum' },
            { type: 'text', label: 'Texto' },
            { type: 'image', label: 'Imagem' },
            { type: 'video', label: 'Vídeo' },
            { type: 'document', label: 'Documento' },
          ].map((item) => (
            <button
              key={item.type}
              onClick={() => onUpdate({ headerType: item.type as any })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-all',
                config.headerType === item.type
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-dark-700 text-dark-300 border border-transparent hover:text-white'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {config.headerType === 'text' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/50">Texto do cabeçalho</span>
              <button
                onClick={() => onOpenVariables('header')}
                className="text-[10px] text-primary-400 hover:text-primary-300"
              >
                + Variável
              </button>
            </div>
            <input
              type="text"
              value={config.headerText || ''}
              onChange={(e) => onUpdate({ headerText: e.target.value })}
              placeholder="Ex: 🛒 Você esqueceu algo!"
              maxLength={60}
              className={cn(
                'w-full px-3 py-2 rounded-lg',
                'bg-[#0a0a0a] border border-white/10',
                'text-sm text-white placeholder-white/30',
                'focus:outline-none focus:border-green-500/50'
              )}
            />
            <div className="text-right text-[10px] text-dark-500">
              {(config.headerText || '').length}/60
            </div>
          </div>
        )}

        {['image', 'video', 'document'].includes(config.headerType || '') && (
          <div className="space-y-2">
            <span className="text-[11px] text-white/50">URL da mídia</span>
            <input
              type="url"
              value={config.headerMediaUrl || ''}
              onChange={(e) => onUpdate({ headerMediaUrl: e.target.value })}
              placeholder="https://exemplo.com/arquivo.jpg"
              className={cn(
                'w-full px-3 py-2 rounded-lg',
                'bg-[#0a0a0a] border border-white/10',
                'text-sm text-white placeholder-white/30',
                'focus:outline-none focus:border-green-500/50'
              )}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-white/60 font-medium">Corpo da Mensagem *</label>
          <button
            onClick={() => onOpenVariables('body')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs font-medium transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Personalizar
          </button>
        </div>
        <textarea
          value={config.bodyText || ''}
          onChange={(e) => onUpdate({ bodyText: e.target.value })}
          placeholder="Digite o corpo da mensagem..."
          rows={6}
          maxLength={1024}
          className={cn(
            'w-full px-3 py-3 rounded-lg resize-none',
            'bg-[#0a0a0a] border border-white/10',
            'text-sm text-white placeholder-white/30',
            'focus:outline-none focus:border-green-500/50 focus:ring-2 focus:ring-green-500/20',
            'transition-all'
          )}
        />
        <div className="text-right text-[10px] text-dark-500">
          {(config.bodyText || '').length}/1024
        </div>
      </div>

      {/* Footer */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-white/60 font-medium">Rodapé</label>
          <span className="text-[10px] text-dark-500">Opcional</span>
        </div>
        <input
          type="text"
          value={config.footerText || ''}
          onChange={(e) => onUpdate({ footerText: e.target.value })}
          placeholder="Ex: Responda SAIR para cancelar"
          maxLength={60}
          className={cn(
            'w-full px-3 py-2 rounded-lg',
            'bg-[#0a0a0a] border border-white/10',
            'text-sm text-white placeholder-white/30',
            'focus:outline-none focus:border-green-500/50'
          )}
        />
      </div>

      {/* Buttons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-white/60 font-medium">Botões</label>
          <span className="text-[10px] text-dark-500">Máx. 3 botões</span>
        </div>

        <div className="space-y-2">
          {(config.buttons || []).map((button, index) => (
            <div key={index} className="flex items-center gap-2 p-3 rounded-lg bg-dark-800 border border-dark-700">
              <select
                value={button.type}
                onChange={(e) => onUpdateButton(index, { type: e.target.value as any })}
                className="px-2 py-1.5 rounded bg-dark-700 border border-dark-600 text-xs text-white"
              >
                <option value="quick_reply">Resposta Rápida</option>
                <option value="url">Link/URL</option>
                <option value="phone">Telefone</option>
              </select>
              <input
                type="text"
                value={button.text}
                onChange={(e) => onUpdateButton(index, { text: e.target.value })}
                placeholder="Texto do botão"
                maxLength={25}
                className="flex-1 px-2 py-1.5 rounded bg-dark-700 border border-dark-600 text-xs text-white placeholder-dark-400"
              />
              {button.type !== 'quick_reply' && (
                <input
                  type="text"
                  value={button.value || ''}
                  onChange={(e) => onUpdateButton(index, { value: e.target.value })}
                  placeholder={button.type === 'url' ? 'https://...' : '+5511...'}
                  className="flex-1 px-2 py-1.5 rounded bg-dark-700 border border-dark-600 text-xs text-white placeholder-dark-400"
                />
              )}
              <button
                onClick={() => onRemoveButton(index)}
                className="p-1.5 rounded hover:bg-red-500/20 text-dark-400 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {(config.buttons || []).length < 3 && (
          <button
            onClick={onAddButton}
            className={cn(
              'w-full py-2.5 rounded-lg text-xs',
              'border border-dashed border-dark-600 hover:border-dark-500',
              'text-dark-400 hover:text-white',
              'transition-colors flex items-center justify-center gap-2'
            )}
          >
            <Plus className="w-4 h-4" />
            Adicionar Botão
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// PHONE PREVIEW
// ============================================

interface PhonePreviewProps {
  config: WhatsAppConfig;
}

function PhonePreview({ config }: PhonePreviewProps) {
  const highlightVariables = (text: string) => {
    if (!text) return null;
    return text.split(/(\{\{[^}]+\}\})/).map((part, i) => {
      if (part.match(/\{\{[^}]+\}\}/)) {
        const varName = part.replace(/\{\{|\}\}/g, '').trim();
        const shortName = varName.split('.').pop() || varName;
        return (
          <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-500/30 text-green-200 text-[11px] font-medium mx-0.5">
            {shortName}
          </span>
        );
      }
      return part;
    });
  };

  const messageText = config.messageMode === 'free' ? config.message : config.bodyText;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-dark-700">
        <div className="flex items-center gap-2 text-white">
          <Smartphone className="w-4 h-4 text-dark-400" />
          <span className="text-sm font-medium">Preview</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-dark-800/50 to-dark-900/50">
        {/* Phone Frame */}
        <div className="w-full max-w-[280px]">
          <div className="bg-[#0b141a] rounded-[2rem] p-2 shadow-2xl border border-dark-600">
            {/* Phone Screen */}
            <div className="bg-[#0b141a] rounded-[1.5rem] overflow-hidden">
              {/* Status Bar */}
              <div className="bg-[#1f2c33] px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] text-white/70">9:41</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-2.5 rounded-sm bg-white/70" />
                </div>
              </div>

              {/* Chat Header */}
              <div className="bg-[#1f2c33] px-4 py-3 flex items-center gap-3 border-b border-[#2a3942]">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm">
                  WA
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Sua Empresa</div>
                  <div className="text-[10px] text-green-400">online</div>
                </div>
              </div>

              {/* Chat Messages */}
              <div
                className="min-h-[300px] p-3 space-y-2"
                style={{
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
                  backgroundColor: '#0b141a',
                }}
              >
                {/* Message Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-[#005c4b] rounded-lg rounded-tr-none p-2.5 relative">
                    {/* Header */}
                    {config.headerType === 'text' && config.headerText && (
                      <div className="font-medium text-white text-sm mb-1.5 pb-1.5 border-b border-white/10">
                        {highlightVariables(config.headerText)}
                      </div>
                    )}

                    {/* Media placeholder */}
                    {['image', 'video', 'document'].includes(config.headerType || '') && (
                      <div className="bg-dark-700/50 rounded-lg mb-2 p-4 flex items-center justify-center">
                        {config.headerType === 'image' && <ImageIcon className="w-8 h-8 text-dark-400" />}
                        {config.headerType === 'video' && <Video className="w-8 h-8 text-dark-400" />}
                        {config.headerType === 'document' && <File className="w-8 h-8 text-dark-400" />}
                      </div>
                    )}

                    {/* Body */}
                    {messageText && (
                      <div className="text-white/90 text-[13px] leading-relaxed whitespace-pre-wrap">
                        {highlightVariables(messageText)}
                      </div>
                    )}

                    {/* Footer */}
                    {config.footerText && (
                      <div className="text-white/50 text-[11px] mt-2 pt-1.5 border-t border-white/10">
                        {config.footerText}
                      </div>
                    )}

                    {/* Buttons */}
                    {(config.buttons || []).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/20 space-y-1.5">
                        {config.buttons?.map((button, i) => (
                          <button
                            key={i}
                            className="w-full py-2 rounded bg-[#00a884]/20 text-[#00a884] text-xs font-medium hover:bg-[#00a884]/30 transition-colors flex items-center justify-center gap-1.5"
                          >
                            {button.type === 'url' && <Link2 className="w-3 h-3" />}
                            {button.type === 'phone' && <MessageCircle className="w-3 h-3" />}
                            {button.text || 'Botão'}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Time */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-white/50">
                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Check className="w-3 h-3 text-blue-400" />
                      <Check className="w-3 h-3 text-blue-400 -ml-2" />
                    </div>

                    {/* Bubble tail */}
                    <div className="absolute -right-1.5 top-0 w-3 h-3 bg-[#005c4b]" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                  </div>
                </div>
              </div>

              {/* Input Bar */}
              <div className="bg-[#1f2c33] px-3 py-2 flex items-center gap-2">
                <div className="flex-1 bg-[#2a3942] rounded-full px-4 py-2">
                  <span className="text-sm text-dark-400">Mensagem</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center">
                  <Send className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SELECT FIELD
// ============================================

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function SelectField({ value, onChange, options }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full px-3 py-2 rounded-lg appearance-none',
          'bg-[#0a0a0a] border border-white/10',
          'text-sm text-white',
          'focus:outline-none focus:border-green-500/50'
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
    </div>
  );
}

export default WhatsAppTemplateEditor;
