'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sparkles, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VariablePicker } from './VariablePicker';
import { extractVariablesFromText } from './variableDefinitions';

// ============================================
// MESSAGE EDITOR WITH VARIABLE SUPPORT
// ============================================

interface MessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  triggerType: string;
  placeholder?: string;
  label?: string;
  rows?: number;
  maxLength?: number;
  showPreview?: boolean;
  eventData?: Record<string, any>;
  className?: string;
}

export function MessageEditor({
  value,
  onChange,
  triggerType,
  placeholder = 'Digite sua mensagem...',
  label,
  rows = 4,
  maxLength,
  showPreview = true,
  eventData,
  className,
}: MessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Track cursor position
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart);
    }
  }, []);

  // Insert variable at cursor position
  const handleInsertVariable = useCallback((variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + variable);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.slice(0, start) + variable + value.slice(end);

    onChange(newValue);

    // Set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + variable.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [value, onChange]);

  // Preview rendered message
  const getPreviewText = useCallback(() => {
    if (!eventData) return value;

    let preview = value;
    const variables = extractVariablesFromText(value);

    for (const varKey of variables) {
      const regex = new RegExp(`\\{\\{\\s*${varKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\|default:'([^']*)')?\\s*\\}\\}`, 'g');

      preview = preview.replace(regex, (match, defaultValue) => {
        const parts = varKey.split('.');
        let val: any = eventData;

        for (const part of parts) {
          if (val === undefined || val === null) break;

          const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
          if (arrayMatch) {
            const [, arrayName, index] = arrayMatch;
            val = val[arrayName]?.[parseInt(index)];
          } else {
            val = val[part];
          }
        }

        if (val !== undefined && val !== null) {
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }

        return defaultValue || `[${varKey}]`;
      });
    }

    return preview;
  }, [value, eventData]);

  // Count variables used
  const variablesUsed = extractVariablesFromText(value).length;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label Row */}
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600/60">{label}</label>
          {variablesUsed > 0 && (
            <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
              {variablesUsed} {variablesUsed === 1 ? 'variável' : 'variáveis'}
            </span>
          )}
        </div>
      )}

      {/* Editor Container */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={handleSelect}
          onClick={handleSelect}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className={cn(
            'w-full px-3 py-2 pr-24 rounded-lg resize-none',
            'bg-white border border-gray-200',
            'text-sm text-gray-700 placeholder-white/30',
            'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
            'transition-all'
          )}
        />

        {/* Actions */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {showPreview && eventData && (
            <button
              onClick={() => setShowPreviewPanel(!showPreviewPanel)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                showPreviewPanel
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'
              )}
              title={showPreviewPanel ? 'Ocultar preview' : 'Ver preview'}
            >
              {showPreviewPanel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => setShowVariablePicker(true)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg',
              'bg-blue-100 hover:bg-blue-200',
              'text-blue-600 hover:text-blue-600',
              'text-xs font-medium transition-colors'
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Personalizar
          </button>
        </div>

        {/* Character count */}
        {maxLength && (
          <div className="absolute bottom-2 left-3 text-[10px] text-gray-400">
            {value.length}/{maxLength}
          </div>
        )}
      </div>

      {/* Preview Panel */}
      <AnimatePresence>
        {showPreviewPanel && eventData && (
          <div className="p-3 rounded-lg bg-gray-100 border border-gray-300">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-medium text-blue-600">Preview com dados do evento</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {getPreviewText()}
            </p>
          </div>
        )}
      </AnimatePresence>

      {/* Variable Picker Modal */}
      <AnimatePresence>
        {showVariablePicker && (
          <VariablePicker
            triggerType={triggerType}
            eventData={eventData}
            onSelect={handleInsertVariable}
            onClose={() => setShowVariablePicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// INLINE VARIABLE BUTTON
// ============================================

interface VariableButtonProps {
  triggerType: string;
  onSelect: (variable: string) => void;
  eventData?: Record<string, any>;
  className?: string;
}

export function VariableButton({ triggerType, onSelect, eventData, className }: VariableButtonProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowPicker(true)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
          'bg-blue-100 hover:bg-blue-200',
          'text-blue-600 hover:text-blue-600',
          'text-xs font-medium transition-colors',
          className
        )}
      >
        <Sparkles className="w-3.5 h-3.5" />
        Variáveis
      </button>

      <AnimatePresence>
        {showPicker && (
          <VariablePicker
            triggerType={triggerType}
            eventData={eventData}
            onSelect={(variable) => {
              onSelect(variable);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default MessageEditor;
