'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Plus, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCredentials, Credential, CredentialType } from '@/hooks/useCredentials';

// ============================================
// TYPES
// ============================================

interface CredentialSelectorProps {
  type: string;
  value?: string;
  onChange: (credentialId: string | undefined) => void;
  label?: string;
  required?: boolean;
}

// ============================================
// CREDENTIAL SELECTOR COMPONENT
// ============================================

export function CredentialSelector({
  type,
  value,
  onChange,
  label = 'Credencial',
  required = false,
}: CredentialSelectorProps) {
  const { credentials, types, isLoading, load, create, test } = useCredentials({ type });
  const [showCreate, setShowCreate] = useState(false);
  const [newCredName, setNewCredName] = useState('');
  const [newCredData, setNewCredData] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Get credential type info
  const credType = types.find((t) => t.type === type);
  const filteredCredentials = credentials.filter((c) => c.type === type);
  const selectedCredential = filteredCredentials.find((c) => c.id === value);

  // Reset form when type changes
  useEffect(() => {
    setNewCredData({});
    setNewCredName('');
  }, [type]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleCreate = async () => {
    if (!newCredName.trim()) return;

    setIsCreating(true);
    try {
      const created = await create(newCredName, type, newCredData);
      if (created) {
        onChange(created.id);
        setShowCreate(false);
        setNewCredName('');
        setNewCredData({});
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleTest = async (credentialId: string) => {
    setIsTesting(credentialId);
    setTestResult(null);
    try {
      const result = await test(credentialId);
      if (result) {
        setTestResult({ id: credentialId, ...result });
      }
    } finally {
      setIsTesting(null);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-white/70">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {/* Selector */}
      {isLoading ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0a0a0a] border border-white/10">
          <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
          <span className="text-sm text-white/40">Carregando...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Dropdown */}
          <div className="relative">
            <select
              value={value || ''}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-lg appearance-none',
                'bg-[#0a0a0a] border border-white/10 text-white',
                'focus:outline-none focus:border-blue-500/50',
                'cursor-pointer'
              )}
            >
              <option value="">Selecione uma credencial...</option>
              {filteredCredentials.map((cred) => (
                <option key={cred.id} value={cred.id}>
                  {cred.name}
                  {cred.last_test_success === false && ' ⚠️'}
                </option>
              ))}
            </select>
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          </div>

          {/* Selected credential status */}
          {selectedCredential && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#0a0a0a] border border-white/10">
              <div className="flex items-center gap-2">
                {selectedCredential.last_test_success === true && (
                  <Check className="w-4 h-4 text-green-400" />
                )}
                {selectedCredential.last_test_success === false && (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                <span className="text-sm text-white/60">
                  {selectedCredential.name}
                </span>
              </div>
              <button
                onClick={() => handleTest(selectedCredential.id)}
                disabled={isTesting === selectedCredential.id}
                className="flex items-center gap-1 px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
              >
                {isTesting === selectedCredential.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Testar
              </button>
            </div>
          )}

          {/* Test result */}
          {testResult && testResult.id === value && (
            <div className={cn(
              'p-2 rounded-lg text-xs',
              testResult.success 
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            )}>
              {testResult.message}
            </div>
          )}

          {/* Create new button */}
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 w-full p-2 rounded-lg border border-dashed border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Criar nova credencial</span>
            </button>
          )}

          {/* Create form */}
          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 rounded-lg bg-[#141414] border border-white/10 space-y-3">
                  <h4 className="text-sm font-medium text-white/80">
                    Nova credencial {credType?.name}
                  </h4>

                  {/* Name */}
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Nome</label>
                    <input
                      type="text"
                      value={newCredName}
                      onChange={(e) => setNewCredName(e.target.value)}
                      placeholder="Ex: Minha conta WhatsApp"
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-sm',
                        'bg-[#0a0a0a] border border-white/10 text-white',
                        'placeholder-white/30',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                  </div>

                  {/* Fields */}
                  {credType?.fields.map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-white/50 mb-1 capitalize">
                        {field.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                      <input
                        type={field.toLowerCase().includes('password') || field.toLowerCase().includes('secret') || field.toLowerCase().includes('token') || field.toLowerCase().includes('key') ? 'password' : 'text'}
                        value={newCredData[field] || ''}
                        onChange={(e) => setNewCredData((prev) => ({ ...prev, [field]: e.target.value }))}
                        className={cn(
                          'w-full px-3 py-2 rounded-lg text-sm',
                          'bg-[#0a0a0a] border border-white/10 text-white',
                          'placeholder-white/30',
                          'focus:outline-none focus:border-blue-500/50'
                        )}
                      />
                    </div>
                  ))}

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        setShowCreate(false);
                        setNewCredName('');
                        setNewCredData({});
                      }}
                      className="px-3 py-1.5 text-sm text-white/60 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!newCredName.trim() || isCreating}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                        'bg-blue-600 hover:bg-blue-500 text-white text-sm',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'transition-colors'
                      )}
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3" />
                          Salvar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default CredentialSelector;
