'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, User, Building2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { cn } from '@/lib/utils';

interface ProfileData {
  name: string;
  email: string;
  phone: string;
}

interface OrgData {
  company_name: string;
  cnpj: string;
  address: string;
  city: string;
  state: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('');
}

export default function AccountSettingsPage() {
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<ProfileData>({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
  });
  const [org, setOrg] = useState<OrgData>({
    company_name: '',
    cnpj: '',
    address: '',
    city: '',
    state: '',
  });

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [profileStatus, setProfileStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [orgStatus, setOrgStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/settings/account');
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            setProfile({
              name: data.profile.name || user?.name || '',
              email: data.profile.email || user?.email || '',
              phone: data.profile.phone || '',
            });
          }
          if (data.organization) {
            setOrg({
              company_name: data.organization.company_name || '',
              cnpj: data.organization.cnpj || '',
              address: data.organization.address || '',
              city: data.organization.city || '',
              state: data.organization.state || '',
            });
          }
        }
      } catch {
        // ignore; use defaults
      } finally {
        setInitialLoad(false);
      }
    }
    fetchData();
  }, [user]);

  async function saveProfile() {
    setLoadingProfile(true);
    setProfileStatus('idle');
    try {
      const res = await fetch('/api/settings/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'profile', ...profile }),
      });
      setProfileStatus(res.ok ? 'success' : 'error');
    } catch {
      setProfileStatus('error');
    } finally {
      setLoadingProfile(false);
      setTimeout(() => setProfileStatus('idle'), 3000);
    }
  }

  async function saveOrg() {
    setLoadingOrg(true);
    setOrgStatus('idle');
    try {
      const res = await fetch('/api/settings/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'organization', ...org }),
      });
      setOrgStatus(res.ok ? 'success' : 'error');
    } catch {
      setOrgStatus('error');
    } finally {
      setLoadingOrg(false);
      setTimeout(() => setOrgStatus('idle'), 3000);
    }
  }

  if (initialLoad) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Conta</h1>
        <p className="text-gray-500 mt-1">Gerencie seu perfil e as informações da sua organização.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card Perfil Pessoal */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-50 rounded-lg">
              <User className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Perfil Pessoal</h2>
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xl flex-shrink-0">
              {getInitials(profile.name) || '?'}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">{profile.name || 'Sem nome'}</p>
              <p className="text-xs text-gray-400">{profile.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
              <input
                type="text"
                value={profile.name}
                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">O email não pode ser alterado.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="+55 (11) 99999-9999"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={saveProfile}
              disabled={loadingProfile}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loadingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Perfil
            </button>
            {profileStatus === 'success' && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" /> Salvo!
              </span>
            )}
            {profileStatus === 'error' && (
              <span className="flex items-center gap-1 text-sm text-red-500">
                <AlertCircle className="w-4 h-4" /> Erro ao salvar
              </span>
            )}
          </div>
        </div>

        {/* Card Organização */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Organização</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
              <input
                type="text"
                value={org.company_name}
                onChange={e => setOrg(o => ({ ...o, company_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Minha Empresa Ltda"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input
                type="text"
                value={org.cnpj}
                onChange={e => setOrg(o => ({ ...o, cnpj: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
              <input
                type="text"
                value={org.address}
                onChange={e => setOrg(o => ({ ...o, address: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Rua Exemplo, 123"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                <input
                  type="text"
                  value={org.city}
                  onChange={e => setOrg(o => ({ ...o, city: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="São Paulo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <input
                  type="text"
                  value={org.state}
                  onChange={e => setOrg(o => ({ ...o, state: e.target.value }))}
                  maxLength={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="SP"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={saveOrg}
              disabled={loadingOrg}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loadingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Organização
            </button>
            {orgStatus === 'success' && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" /> Salvo!
              </span>
            )}
            {orgStatus === 'error' && (
              <span className="flex items-center gap-1 text-sm text-red-500">
                <AlertCircle className="w-4 h-4" /> Erro ao salvar
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
