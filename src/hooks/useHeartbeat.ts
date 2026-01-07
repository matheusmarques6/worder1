'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores';

const HEARTBEAT_INTERVAL = 30000; // 30 segundos

export function useHeartbeat() {
  const { user } = useAuthStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Verificar se é agente
  const isAgent = user?.user_metadata?.is_agent === true;
  const agentId = user?.user_metadata?.agent_id;

  // Enviar heartbeat
  const sendHeartbeat = useCallback(async () => {
    if (!agentId) return;

    try {
      await fetch('/api/agents/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          agent_id: agentId,
          status: 'online'
        }),
      });
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }, [agentId]);

  // Iniciar heartbeat quando é agente
  useEffect(() => {
    if (!isAgent || !agentId) return;

    // Enviar heartbeat imediatamente
    sendHeartbeat();

    // Configurar intervalo
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Enviar heartbeat offline ao sair
    const handleBeforeUnload = () => {
      // Não podemos usar fetch async aqui, mas podemos usar sendBeacon
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/agents/status',
          JSON.stringify({ agent_id: agentId, status: 'offline' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAgent, agentId, sendHeartbeat]);

  // Atualizar status manualmente
  const setStatus = useCallback(async (status: 'online' | 'away' | 'busy' | 'offline') => {
    if (!agentId) return false;

    try {
      const res = await fetch('/api/agents/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, status }),
      });
      return res.ok;
    } catch (error) {
      console.error('Error setting status:', error);
      return false;
    }
  }, [agentId]);

  return { setStatus, isAgent };
}

export default useHeartbeat;
