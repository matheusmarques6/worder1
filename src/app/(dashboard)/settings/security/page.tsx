'use client';

import { useState, useEffect } from 'react';
import { Shield, Lock, Smartphone, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores';

interface AuditLog {
  id: string;
  action: string;
  details?: string;
  user_email?: string;
  ip_address?: string;
  created_at: string;
}

export default function SecuritySettingsPage() {
  const { user } = useAuthStore();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch('/api/settings/audit-logs');
        if (res.ok) {
          const data = await res.json();
          setAuditLogs(data.logs || []);
        }
      } catch {}
      setLoading(false);
    }
    fetchLogs();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Segurança</h1>
        <p className="text-sm text-gray-500 mt-1">Configurações de segurança e log de atividades</p>
      </div>

      {/* 2FA */}
      <TwoFactorCard />

      {/* Active Sessions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Lock className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">Sessões Ativas</h3>
            <p className="text-xs text-gray-500 mt-0.5">Dispositivos conectados à sua conta</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <div>
              <p className="text-sm text-gray-900">Sessão atual</p>
              <p className="text-xs text-gray-500">{user?.email || 'Usuário'} · Agora</p>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <Clock className="w-5 h-5 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900">Log de Atividades</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma atividade registrada</h3>
            <p className="text-sm text-gray-500">As atividades da sua organização aparecerão aqui</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ação</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Usuário</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Detalhes</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-900">{log.action}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{log.user_email || '-'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500 max-w-xs truncate">{log.details || '-'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {log.created_at ? new Date(log.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// =============================================
// TwoFactorCard — TOTP enrollment + verify flow
// Usa Supabase Auth MFA: enroll devolve secret + QR; verify
// promove o factor pra 'verified', a partir daí o login pede o
// código de 6 dígitos. Backup codes ficam pra Tier seguinte.
// =============================================
function TwoFactorCard() {
  const [enabled, setEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loadingState, setLoadingState] = useState(true);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/2fa');
        const data = await res.json();
        const verified = (data.totp || []).find((f: any) => f.status === 'verified');
        setEnabled(!!verified);
        setVerifiedFactorId(verified?.id || null);
      } catch {}
      setLoadingState(false);
    })();
  }, []);

  const startEnroll = async () => {
    setWorking(true);
    setErr(null);
    try {
      const res = await fetch('/api/settings/2fa/enroll', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Falha ao iniciar enrollment');
        return;
      }
      setFactorId(data.factorId);
      setQrCode(data.qrCode);
      setSecret(data.secret);
    } finally {
      setWorking(false);
    }
  };

  const verify = async () => {
    if (!factorId || code.length < 6) return;
    setWorking(true);
    setErr(null);
    try {
      const res = await fetch('/api/settings/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factorId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Código inválido');
        return;
      }
      setEnabled(true);
      setVerifiedFactorId(factorId);
      setFactorId(null);
      setQrCode(null);
      setSecret(null);
      setCode('');
    } finally {
      setWorking(false);
    }
  };

  const disable = async () => {
    if (!verifiedFactorId) return;
    if (!window.confirm('Desativar 2FA? Sua conta ficará menos protegida.')) return;
    setWorking(true);
    try {
      await fetch(`/api/settings/2fa?factorId=${verifiedFactorId}`, { method: 'DELETE' });
      setEnabled(false);
      setVerifiedFactorId(null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">Autenticação de Dois Fatores (2FA)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Adicione uma camada extra de segurança usando um app autenticador (Google Authenticator, 1Password, Authy).
            </p>
          </div>
        </div>
        {loadingState ? null : enabled ? (
          <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-medium">Ativo</span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium">Desativado</span>
        )}
      </div>

      {!loadingState && !enabled && !factorId && (
        <button
          onClick={startEnroll}
          disabled={working}
          className="text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 px-3 py-1.5 rounded-lg"
        >
          {working ? 'Gerando…' : 'Ativar 2FA'}
        </button>
      )}

      {factorId && qrCode && (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-700 mb-2">
              1. Escaneie o QR code no seu app autenticador:
            </p>
            <img src={qrCode} alt="QR code 2FA" className="w-44 h-44 border border-gray-200 rounded-lg" />
            {secret && (
              <p className="text-[11px] text-gray-400 mt-2">
                Ou digite manualmente: <code className="bg-gray-50 px-1 py-0.5 rounded">{secret}</code>
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              2. Digite o código de 6 dígitos que aparece no app:
            </label>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                placeholder="000000"
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm w-32 tracking-widest text-center focus:outline-none focus:border-zinc-400"
              />
              <button
                onClick={verify}
                disabled={code.length < 6 || working}
                className="text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 px-3 py-1.5 rounded-lg"
              >
                {working ? 'Verificando…' : 'Verificar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enabled && (
        <button
          onClick={disable}
          disabled={working}
          className="text-xs font-medium text-red-600 hover:text-red-700"
        >
          Desativar 2FA
        </button>
      )}

      {err && (
        <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {err}
        </p>
      )}
    </div>
  );
}
