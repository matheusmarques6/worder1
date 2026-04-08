'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Loader2, X, Send, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'invited';
  created_at: string;
  profiles?: {
    name?: string;
    email?: string;
  };
}

const ROLE_LABELS: Record<string, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-purple-100 text-purple-700' },
  editor: { label: 'Editor', className: 'bg-blue-100 text-blue-700' },
  viewer: { label: 'Viewer', className: 'bg-gray-100 text-gray-600' },
};

function getInitials(name?: string, email?: string): string {
  const source = name || email || '?';
  return source
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('');
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
      new Date(dateStr)
    );
  } catch {
    return '-';
  }
}

export default function UsersSettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/users');
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMembers();
  }, []);

  async function handleInvite() {
    if (!inviteEmail) return;
    setInviting(true);
    setInviteError('');
    try {
      const res = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setInviteError(data.error || 'Erro ao convidar');
      } else {
        setInviteSuccess(true);
        setInviteEmail('');
        setInviteRole('editor');
        await fetchMembers();
        setTimeout(() => {
          setInviteSuccess(false);
          setShowInvite(false);
        }, 2000);
      }
    } catch {
      setInviteError('Erro ao convidar membro');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
          <p className="text-gray-500 mt-1">Gerencie os membros da sua organização.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Convidar Membro
        </button>
      </div>

      {/* Invite Dialog */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Convidar Membro</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="colega@empresa.com"
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="admin">Admin — acesso total</option>
                  <option value="editor">Editor — pode editar</option>
                  <option value="viewer">Viewer — somente leitura</option>
                </select>
              </div>
              {inviteError && (
                <p className="flex items-center gap-1 text-sm text-red-500">
                  <AlertCircle className="w-4 h-4" /> {inviteError}
                </p>
              )}
              {inviteSuccess && (
                <p className="text-sm text-green-600 font-medium">Convite enviado com sucesso!</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Convidar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Nenhum membro ainda</p>
            <p className="text-gray-400 text-sm mt-1">Convide membros para colaborar na sua organização.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-100">
              <tr className="text-left">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Membro</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Função</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Entrou em</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(member => {
                const name = member.profiles?.name;
                const email = member.email || member.profiles?.email || '';
                const initials = getInitials(name, email);
                const role = ROLE_LABELS[member.role] || ROLE_LABELS.viewer;
                return (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-semibold text-sm flex-shrink-0">
                          {initials}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{email}</td>
                    <td className="px-6 py-4">
                      <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', role.className)}>
                        {role.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(member.created_at)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'px-2.5 py-0.5 rounded-full text-xs font-medium',
                          member.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        )}
                      >
                        {member.status === 'active' ? 'Ativo' : 'Convidado'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
