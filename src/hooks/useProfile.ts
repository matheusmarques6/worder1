'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores';

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: 'admin' | 'manager' | 'agent';
  avatar_url: string | null;
  organization_id: string;
  created_at?: string;
  updated_at?: string;
}

interface UseProfileReturn {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<boolean>;
  uploadAvatar: (file: File) => Promise<string | null>;
  removeAvatar: () => Promise<boolean>;
  requestPasswordReset: () => Promise<boolean>;
}

export function useProfile(): UseProfileReturn {
  const { user, setUser } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar perfil
  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/profile');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar perfil');
      }

      setProfile(data.profile);
    } catch (err: any) {
      console.error('Fetch profile error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Atualizar perfil
  const updateProfile = useCallback(async (data: Partial<Profile>): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao atualizar perfil');
      }

      // Atualizar estado local
      setProfile(prev => prev ? { ...prev, ...data } : null);

      // Atualizar store global
      if (user) {
        setUser({
          ...user,
          name: `${data.first_name || profile?.first_name || ''} ${data.last_name || profile?.last_name || ''}`.trim(),
          avatar_url: data.avatar_url || profile?.avatar_url || undefined,
        });
      }

      return true;
    } catch (err: any) {
      console.error('Update profile error:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, profile, setUser]);

  // Upload de avatar
  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao fazer upload');
      }

      // Atualizar estado local
      setProfile(prev => prev ? { ...prev, avatar_url: result.avatar_url } : null);

      // Atualizar store global
      if (user) {
        setUser({
          ...user,
          avatar_url: result.avatar_url,
        });
      }

      return result.avatar_url;
    } catch (err: any) {
      console.error('Upload avatar error:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, setUser]);

  // Remover avatar
  const removeAvatar = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile/avatar', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao remover avatar');
      }

      // Atualizar estado local
      setProfile(prev => prev ? { ...prev, avatar_url: null } : null);

      // Atualizar store global
      if (user) {
        setUser({
          ...user,
          avatar_url: undefined,
        });
      }

      return true;
    } catch (err: any) {
      console.error('Remove avatar error:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, setUser]);

  // Solicitar reset de senha
  const requestPasswordReset = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'reset-password',
          email: profile?.email || user?.email 
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao enviar email');
      }

      return true;
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [profile?.email, user?.email]);

  // Carregar perfil ao montar
  useEffect(() => {
    if (user?.id && !profile) {
      fetchProfile();
    }
  }, [user?.id, profile, fetchProfile]);

  return {
    profile,
    loading,
    error,
    fetchProfile,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    requestPasswordReset,
  };
}

export default useProfile;
