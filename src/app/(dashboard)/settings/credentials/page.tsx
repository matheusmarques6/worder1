'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  Plus,
  MoreVertical,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  Edit2,
  MessageSquare,
  Mail,
  ShoppingBag,
  Globe,
  Webhook,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface Credential {
  id: string;
  name: string;
  type: string;
  last_used_at?: string;
  last_test_at?: string;
  last_test_success?: boolean;
  automations_using?: string[];
  created_at: string;
  masked_fields?: Record<string, string>;
}

interface CredentialType {
  type: string;
  name: string;
  icon: string;
  description: string;
  fields: CredentialField[];
}

interface CredentialField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'email';
  required: boolean;
  placeholder?: string;
  help?: string;
}

// ============================================
// CREDENTIAL TYPES CONFIG
// ============================================

const CREDENTIAL_TYPES: CredentialType[] = [
  {
    type: 'whatsappBusiness',
    name: 'WhatsApp Business Cloud',
    icon: 'MessageSquare',
    description: 'API oficial do WhatsApp Business via Meta',
    fields: [
      { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: 'Ex: 123456789012345' },
      { name: 'accessToken', label: 'Access Token', type: 'password', required: true, placeholder: 'Token de acesso permanente' },
      { name: 'businessAccountId', label: 'Business Account ID', type: 'text', required: false, placeholder: 'WABA ID (opcional)' },
    ],
  },
  {
    type: 'whatsappEvolution',
    name: 'WhatsApp Evolution API',
    icon: 'MessageSquare',
    description: 'Evolution API para WhatsApp não-oficial',
    fields: [
      { name: 'evolutionUrl', label: 'URL da API', type: 'url', required: true, placeholder: 'https://sua-instancia.evolution.com' },
      { name: 'instanceName', label: 'Nome da Instância', type: 'text', required: true, placeholder: 'Ex: minha-instancia' },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Sua chave de API' },
    ],
  },
  {
    type: 'emailResend',
    name: 'Email (Resend)',
    icon: 'Mail',
    description: 'Envio de emails via Resend.com',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 're_xxx...' },
      { name: 'defaultFrom', label: 'Email Padrão', type: 'email', required: true, placeholder: 'noreply@seudominio.com' },
    ],
  },
  {
    type: 'emailSendgrid',
    name: 'Email (SendGrid)',
    icon: 'Mail',
    description: 'Envio de emails via SendGrid',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'SG.xxx...' },
      { name: 'defaultFrom', label: 'Email Padrão', type: 'email', required: true, placeholder: 'noreply@seudominio.com' },
    ],
  },
  {
    type: 'shopifyOAuth2',
    name: 'Shopify',
    icon: 'ShoppingBag',
    description: 'Integração com lojas Shopify',
    fields: [
      { name: 'shopDomain', label: 'Domínio da Loja', type: 'text', required: true, placeholder: 'sua-loja.myshopify.com' },
      { name: 'accessToken', label: 'Access Token', type: 'password', required: true, placeholder: 'shpat_xxx...' },
    ],
  },
  {
    type: 'httpBasicAuth',
    name: 'HTTP Basic Auth',
    icon: 'Globe',
    description: 'Autenticação básica para APIs REST',
    fields: [
      { name: 'username', label: 'Usuário', type: 'text', required: true, placeholder: 'Seu usuário' },
      { name: 'password', label: 'Senha', type: 'password', required: true, placeholder: 'Sua senha' },
    ],
  },
  {
    type: 'httpApiKey',
    name: 'HTTP API Key',
    icon: 'Key',
    description: 'Autenticação via header ou query param',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Sua chave de API' },
      { name: 'headerName', label: 'Nome do Header', type: 'text', required: false, placeholder: 'X-API-Key (padrão)' },
    ],
  },
  {
    type: 'webhook',
    name: 'Webhook Customizado',
    icon: 'Webhook',
    description: 'Configuração para webhooks externos',
    fields: [
      { name: 'url', label: 'URL do Webhook', type: 'url', required: true, placeholder: 'https://api.exemplo.com/webhook' },
      { name: 'secret', label: 'Secret (opcional)', type: 'password', required: false, placeholder: 'Para validação de assinatura' },
      { name: 'headers', label: 'Headers Adicionais (JSON)', type: 'text', required: false, placeholder: '{"X-Custom": "value"}' },
    ],
  },
  {
    type: 'database',
    name: 'Banco de Dados',
    icon: 'Database',
    description: 'Conexão com banco de dados externo',
    fields: [
      { name: 'connectionString', label: 'Connection String', type: 'password', required: true, placeholder: 'postgres://user:pass@host:5432/db' },
    ],
  },
];

// ============================================
// ICON MAPPING
// ============================================

const IconMap: Record<string, React.FC<{ className?: string }>> = {
  MessageSquare,
  Mail,
  ShoppingBag,
  Globe,
  Key,
  Webhook,
  Database,
};

// ============================================
// CREDENTIALS PAGE COMPONENT
// ============================================

export default function CredentialsPage() {
  // State
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [selectedType, setSelectedType] = useState<CredentialType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [credentialName, setCredentialName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Set<string>>(new Set());

  // ============================================
  // FETCH CREDENTIALS
  // ============================================

  const fetchCredentials = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/credentials');
      if (!response.ok) throw new Error('Falha ao carregar credenciais');
      
      const data = await response.json();
      setCredentials(data.credentials || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  // ============================================
  // CREATE/UPDATE CREDENTIAL
  // ============================================

  const handleSave = async () => {
    if (!selectedType || !credentialName.trim()) return;

    // Validate required fields
    const missingFields = selectedType.fields
      .filter((f) => f.required && !formData[f.name]?.trim())
      .map((f) => f.label);

    if (missingFields.length > 0) {
      setError(`Campos obrigatórios faltando: ${missingFields.join(', ')}`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/credentials', {
        method: editingCredential ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCredential?.id,
          name: credentialName,
          type: selectedType.type,
          data: formData,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Falha ao salvar');
      }

      await fetchCredentials();
      closeModal();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // DELETE CREDENTIAL
  // ============================================

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta credencial?')) return;

    try {
      const response = await fetch(`/api/credentials/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Falha ao excluir');

      await fetchCredentials();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ============================================
  // TEST CREDENTIAL
  // ============================================

  const handleTest = async (id: string) => {
    setTestingId(id);

    try {
      const response = await fetch('/api/credentials/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: id }),
      });

      const data = await response.json();
      
      // Update credential status locally
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, last_test_at: new Date().toISOString(), last_test_success: data.success }
            : c
        )
      );

      if (!data.success) {
        setError(`Teste falhou: ${data.error || 'Conexão não estabelecida'}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingId(null);
    }
  };

  // ============================================
  // MODAL HELPERS
  // ============================================

  const openCreateModal = () => {
    setEditingCredential(null);
    setSelectedType(null);
    setFormData({});
    setCredentialName('');
    setShowModal(true);
  };

  const openEditModal = (credential: Credential) => {
    setEditingCredential(credential);
    const type = CREDENTIAL_TYPES.find((t) => t.type === credential.type);
    setSelectedType(type || null);
    setCredentialName(credential.name);
    setFormData(credential.masked_fields || {});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCredential(null);
    setSelectedType(null);
    setFormData({});
    setCredentialName('');
    setError(null);
  };

  const toggleShowPassword = (fieldName: string) => {
    const newSet = new Set(showPasswords);
    if (newSet.has(fieldName)) {
      newSet.delete(fieldName);
    } else {
      newSet.add(fieldName);
    }
    setShowPasswords(newSet);
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Credenciais</h1>
          <p className="text-white/60 mt-1">
            Gerencie as credenciais de integração para suas automações
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-blue-600 hover:bg-blue-500 text-white',
            'font-medium transition-colors'
          )}
        >
          <Plus className="w-4 h-4" />
          Nova Credencial
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 border border-red-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
          <p className="text-white/60">Carregando credenciais...</p>
        </div>
      ) : credentials.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/20 rounded-lg">
          <Key className="w-12 h-12 text-white/20 mb-3" />
          <p className="text-white/60">Nenhuma credencial cadastrada</p>
          <p className="text-white/40 text-sm mt-1">
            Crie uma credencial para conectar suas integrações
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium"
          >
            + Criar primeira credencial
          </button>
        </div>
      ) : (
        /* Credentials Grid */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {credentials.map((credential) => {
            const typeConfig = CREDENTIAL_TYPES.find((t) => t.type === credential.type);
            const IconComponent = IconMap[typeConfig?.icon || 'Key'] || Key;

            return (
              <div
                key={credential.id}
                className="p-4 rounded-lg bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/5">
                      <IconComponent className="w-5 h-5 text-white/60" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{credential.name}</h3>
                      <p className="text-xs text-white/40">{typeConfig?.name || credential.type}</p>
                    </div>
                  </div>

                  {/* Actions Menu */}
                  <div className="relative group">
                    <button className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 py-1 bg-[#1a1a1a] rounded-lg border border-white/10 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
                      <button
                        onClick={() => openEditModal(credential)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
                      >
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleTest(credential.id)}
                        disabled={testingId === credential.id}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
                      >
                        {testingId === credential.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Testar
                      </button>
                      <button
                        onClick={() => handleDelete(credential.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-4 text-xs">
                  {credential.last_test_at && (
                    <div className="flex items-center gap-1">
                      {credential.last_test_success ? (
                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400" />
                      )}
                      <span className={credential.last_test_success ? 'text-green-400' : 'text-red-400'}>
                        {credential.last_test_success ? 'Conectado' : 'Falhou'}
                      </span>
                    </div>
                  )}
                  {credential.automations_using && credential.automations_using.length > 0 && (
                    <span className="text-white/40">
                      {credential.automations_using.length} automação(ões)
                    </span>
                  )}
                </div>

                {/* Last Used */}
                {credential.last_used_at && (
                  <p className="text-xs text-white/30 mt-2">
                    Último uso: {new Date(credential.last_used_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg max-h-[90vh] overflow-hidden rounded-xl bg-[#111111] border border-white/10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">
                  {editingCredential ? 'Editar Credencial' : 'Nova Credencial'}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 space-y-4 max-h-[calc(90vh-140px)] overflow-y-auto">
                {!selectedType ? (
                  /* Type Selection */
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">
                      Selecione o tipo de integração
                    </label>
                    <div className="grid gap-2">
                      {CREDENTIAL_TYPES.map((type) => {
                        const IconComponent = IconMap[type.icon] || Key;
                        return (
                          <button
                            key={type.type}
                            onClick={() => setSelectedType(type)}
                            className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:border-white/30 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="p-2 rounded-lg bg-white/5">
                              <IconComponent className="w-5 h-5 text-white/60" />
                            </div>
                            <div>
                              <p className="font-medium text-white">{type.name}</p>
                              <p className="text-xs text-white/40">{type.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Credential Form */
                  <div className="space-y-4">
                    {/* Back Button */}
                    {!editingCredential && (
                      <button
                        onClick={() => setSelectedType(null)}
                        className="text-sm text-white/60 hover:text-white"
                      >
                        ← Voltar
                      </button>
                    )}

                    {/* Name Field */}
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-1">
                        Nome da Credencial *
                      </label>
                      <input
                        type="text"
                        value={credentialName}
                        onChange={(e) => setCredentialName(e.target.value)}
                        placeholder={`Ex: ${selectedType.name} - Produção`}
                        className={cn(
                          'w-full px-3 py-2 rounded-lg',
                          'bg-[#0a0a0a] border border-white/10 text-white',
                          'placeholder-white/30',
                          'focus:outline-none focus:border-blue-500/50'
                        )}
                      />
                    </div>

                    {/* Dynamic Fields */}
                    {selectedType.fields.map((field) => (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-white/70 mb-1">
                          {field.label} {field.required && '*'}
                        </label>
                        <div className="relative">
                          <input
                            type={field.type === 'password' && !showPasswords.has(field.name) ? 'password' : 'text'}
                            value={formData[field.name] || ''}
                            onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                            placeholder={field.placeholder}
                            className={cn(
                              'w-full px-3 py-2 rounded-lg pr-10',
                              'bg-[#0a0a0a] border border-white/10 text-white',
                              'placeholder-white/30',
                              'focus:outline-none focus:border-blue-500/50'
                            )}
                          />
                          {field.type === 'password' && (
                            <button
                              type="button"
                              onClick={() => toggleShowPassword(field.name)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white"
                            >
                              {showPasswords.has(field.name) ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                        {field.help && (
                          <p className="mt-1 text-xs text-white/40">{field.help}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              {selectedType && (
                <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !credentialName.trim()}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg',
                      'bg-blue-600 hover:bg-blue-500 text-white',
                      'text-sm font-medium',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'transition-colors'
                    )}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Salvar
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
