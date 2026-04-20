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
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">Autenticação de Dois Fatores (2FA)</h3>
              <p className="text-xs text-gray-500 mt-0.5">Adicione uma camada extra de segurança à sua conta</p>
            </div>
          </div>
          <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium">Em breve</span>
        </div>
      </div>

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
