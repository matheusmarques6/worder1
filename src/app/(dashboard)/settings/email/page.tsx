'use client';

import { useState, useEffect } from 'react';
import {
  Mail,
  Globe,
  Server,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Save,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendingDomain {
  id: string;
  domain: string;
  status: 'verified' | 'pending' | 'failed';
  created_at: string;
  verified_at?: string | null;
  dns_records?: DnsRecord[] | null;
}

interface DnsRecord {
  type: string;
  host: string;
  value: string;
}

interface SenderSettings {
  sender_name: string;
  sender_email: string;
  reply_to: string;
}

interface SendingServer {
  id: string;
  name: string;
  host?: string;
  port?: number;
  username?: string;
  provider?: string;
  status: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  verified: {
    label: 'Verificado',
    icon: <CheckCircle className="w-3 h-3" />,
    className: 'bg-green-100 text-green-700',
  },
  pending: {
    label: 'Pendente',
    icon: <Clock className="w-3 h-3" />,
    className: 'bg-yellow-100 text-yellow-700',
  },
  failed: {
    label: 'Falhou',
    icon: <AlertCircle className="w-3 h-3" />,
    className: 'bg-red-100 text-red-700',
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmailSettingsPage() {
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [senderSettings, setSenderSettings] = useState<SenderSettings>({
    sender_name: '',
    sender_email: '',
    reply_to: '',
  });
  const [servers, setServers] = useState<SendingServer[]>([]);

  const [loadingData, setLoadingData] = useState(true);
  const [savingSender, setSavingSender] = useState(false);
  const [senderStatus, setSenderStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [senderError, setSenderError] = useState('');

  // Add domain dialog
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [addDomainError, setAddDomainError] = useState('');

  // Add server dialog
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', host: '', port: '587', username: '', provider: '' });
  const [addingServer, setAddingServer] = useState(false);
  const [addServerError, setAddServerError] = useState('');

  // Verify/delete loading
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deletingDomainId, setDeletingDomainId] = useState<string | null>(null);
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);

  async function fetchData() {
    setLoadingData(true);
    try {
      const res = await fetch('/api/settings/email');
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains ?? []);
        if (data.senderSettings) setSenderSettings(data.senderSettings);
        setServers(data.servers ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // ── Sender save ────────────────────────────────────────────────────────────

  async function saveSender(e: React.FormEvent) {
    e.preventDefault();
    setSavingSender(true);
    setSenderStatus('idle');
    setSenderError('');
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sender', ...senderSettings }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erro ao salvar');
      }
      setSenderStatus('success');
      setTimeout(() => setSenderStatus('idle'), 3000);
    } catch (err: any) {
      setSenderStatus('error');
      setSenderError(err.message);
    } finally {
      setSavingSender(false);
    }
  }

  // ── Add domain ─────────────────────────────────────────────────────────────

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAddingDomain(true);
    setAddDomainError('');
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'add_domain', domain: newDomain.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erro ao adicionar domínio');
      }
      setNewDomain('');
      setShowAddDomain(false);
      await fetchData();
    } catch (err: any) {
      setAddDomainError(err.message);
    } finally {
      setAddingDomain(false);
    }
  }

  async function verifyDomain(id: string) {
    setVerifyingId(id);
    try {
      await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'verify_domain', domain_id: id }),
      });
      await fetchData();
    } finally {
      setVerifyingId(null);
    }
  }

  async function deleteDomain(id: string) {
    setDeletingDomainId(id);
    try {
      await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'delete_domain', domain_id: id }),
      });
      setDomains(prev => prev.filter(d => d.id !== id));
    } finally {
      setDeletingDomainId(null);
    }
  }

  // ── Add server ─────────────────────────────────────────────────────────────

  async function addServer(e: React.FormEvent) {
    e.preventDefault();
    if (!newServer.name.trim()) return;
    setAddingServer(true);
    setAddServerError('');
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'add_server',
          name: newServer.name,
          host: newServer.host,
          port: parseInt(newServer.port, 10) || 587,
          username: newServer.username,
          provider: newServer.provider,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erro ao adicionar servidor');
      }
      setNewServer({ name: '', host: '', port: '587', username: '', provider: '' });
      setShowAddServer(false);
      await fetchData();
    } catch (err: any) {
      setAddServerError(err.message);
    } finally {
      setAddingServer(false);
    }
  }

  async function deleteServer(id: string) {
    setDeletingServerId(id);
    try {
      await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'delete_server', server_id: id }),
      });
      setServers(prev => prev.filter(s => s.id !== id));
    } finally {
      setDeletingServerId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Configurações de Email</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie domínios, identidade do remetente e servidores de envio</p>
      </div>

      {/* ── Section 1: Sending Domains ─────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Domínios de Envio</h2>
          </div>
          <button
            onClick={() => { setShowAddDomain(true); setAddDomainError(''); setNewDomain(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Domínio
          </button>
        </div>

        {/* Add domain form */}
        {showAddDomain && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <form onSubmit={addDomain} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Domínio</label>
                <input
                  type="text"
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value)}
                  placeholder="ex: mail.suaempresa.com.br"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                {addDomainError && (
                  <p className="text-xs text-red-600 mt-1">{addDomainError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={addingDomain || !newDomain.trim()}
                className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {addingDomain && <Loader2 className="w-4 h-4 animate-spin" />}
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => setShowAddDomain(false)}
                className="px-3 py-2 border border-gray-200 bg-white text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </form>
          </div>
        )}

        {domains.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Nenhum domínio adicionado. Adicione um domínio para melhorar a entregabilidade dos seus emails.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {domains.map(domain => {
              const badge = STATUS_BADGE[domain.status] ?? STATUS_BADGE.pending;
              return (
                <div key={domain.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900">{domain.domain}</span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                          badge.className
                        )}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {domain.status !== 'verified' && (
                        <button
                          onClick={() => verifyDomain(domain.id)}
                          disabled={verifyingId === domain.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {verifyingId === domain.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Verificar
                        </button>
                      )}
                      <button
                        onClick={() => deleteDomain(domain.id)}
                        disabled={deletingDomainId === domain.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Remover domínio"
                      >
                        {deletingDomainId === domain.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* DNS Records */}
                  {domain.dns_records && domain.dns_records.length > 0 && (
                    <div className="mt-3 bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">Registros DNS necessários:</p>
                      <div className="space-y-2">
                        {domain.dns_records.map((rec, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs font-mono">
                            <span className="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded text-[10px] uppercase flex-shrink-0">
                              {rec.type}
                            </span>
                            <span className="text-gray-600 flex-shrink-0">{rec.host}</span>
                            <span className="text-gray-500 truncate flex-1">{rec.value}</span>
                            <CopyButton text={rec.value} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: Sender Identity ─────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <Mail className="w-5 h-5 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">Identidade do Remetente</h2>
        </div>
        <form onSubmit={saveSender} className="px-6 py-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nome do Remetente
              </label>
              <input
                type="text"
                value={senderSettings.sender_name}
                onChange={e => setSenderSettings(prev => ({ ...prev, sender_name: e.target.value }))}
                placeholder="Ex: Minha Empresa"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email do Remetente
              </label>
              <input
                type="email"
                value={senderSettings.sender_email}
                onChange={e => setSenderSettings(prev => ({ ...prev, sender_email: e.target.value }))}
                placeholder="noreply@suaempresa.com.br"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Responder Para (Reply-To)
            </label>
            <input
              type="email"
              value={senderSettings.reply_to}
              onChange={e => setSenderSettings(prev => ({ ...prev, reply_to: e.target.value }))}
              placeholder="contato@suaempresa.com.br"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Endereço para onde as respostas dos destinatários serão enviadas.
            </p>
          </div>

          {senderStatus === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {senderError || 'Erro ao salvar configurações'}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={savingSender}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {savingSender ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
            {senderStatus === 'success' && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                Salvo com sucesso
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ── Section 3: Sending Servers ─────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Servidores de Envio</h2>
          </div>
          <button
            onClick={() => { setShowAddServer(true); setAddServerError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Servidor
          </button>
        </div>

        {/* Add server form */}
        {showAddServer && (
          <div className="px-6 py-5 bg-gray-50 border-b border-gray-100">
            <form onSubmit={addServer} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                  <input
                    type="text"
                    required
                    value={newServer.name}
                    onChange={e => setNewServer(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: SMTP Principal"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Provedor / Tipo</label>
                  <input
                    type="text"
                    value={newServer.provider}
                    onChange={e => setNewServer(prev => ({ ...prev, provider: e.target.value }))}
                    placeholder="Ex: SMTP, SendGrid, Mailgun"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Host</label>
                  <input
                    type="text"
                    value={newServer.host}
                    onChange={e => setNewServer(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="smtp.seuservidor.com"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Porta</label>
                  <input
                    type="number"
                    value={newServer.port}
                    onChange={e => setNewServer(prev => ({ ...prev, port: e.target.value }))}
                    placeholder="587"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Usuário</label>
                  <input
                    type="text"
                    value={newServer.username}
                    onChange={e => setNewServer(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="usuario@smtp.com"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>
              {addServerError && (
                <p className="text-xs text-red-600">{addServerError}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={addingServer || !newServer.name.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {addingServer && <Loader2 className="w-4 h-4 animate-spin" />}
                  Adicionar
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddServer(false)}
                  className="px-3 py-2 border border-gray-200 bg-white text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {servers.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Nenhum servidor de envio configurado. Por padrão, os emails são enviados pelo servidor compartilhado da plataforma.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Provedor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Host</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Porta</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {servers.map(srv => (
                  <tr key={srv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{srv.name}</td>
                    <td className="px-4 py-3 text-gray-600">{srv.provider || '-'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{srv.host || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{srv.port ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          srv.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {srv.status === 'active' ? 'Ativo' : srv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteServer(srv.id)}
                        disabled={deletingServerId === srv.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Remover servidor"
                      >
                        {deletingServerId === srv.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
