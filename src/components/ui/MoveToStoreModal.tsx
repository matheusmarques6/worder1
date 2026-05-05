'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRight, Check, AlertCircle, Store as StoreIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Store {
  id: string;
  shop_name: string;
  shop_domain: string;
  is_active: boolean;
}

export interface MoveToStoreModalProps {
  open: boolean;
  onClose: () => void;
  /** API endpoint that accepts POST { targetStoreId: string } */
  endpoint: string;
  resourceName: string;
  resourceLabel?: string;
  currentStoreId?: string;
  onMoved?: () => void;
}

export function MoveToStoreModal({
  open,
  onClose,
  endpoint,
  resourceName,
  resourceLabel = 'Recurso',
  currentStoreId,
  onMoved,
}: MoveToStoreModalProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccess(false);
    setSelectedId(null);
    setLoading(true);
    fetch('/api/stores')
      .then(res => res.json())
      .then(data => {
        const list = (data.stores || data || [])
          .filter((s: Store) => s.is_active && s.id !== currentStoreId);
        setStores(list);
      })
      .catch(() => setError('Erro ao carregar lojas'))
      .finally(() => setLoading(false));
  }, [open, currentStoreId]);

  const handleMove = async () => {
    if (!selectedId) {
      setError('Selecione uma loja de destino');
      return;
    }
    setMoving(true);
    setError('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStoreId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao mover');
        return;
      }
      setSuccess(true);
      onMoved?.();
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.message || 'Erro ao mover');
    } finally {
      setMoving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={moving ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Mover para outra loja</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[300px]">{resourceName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={moving}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-emerald-600" strokeWidth={2.5} />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 mb-1">{resourceLabel} movido</h3>
            <p className="text-sm text-zinc-500">A página vai atualizar.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2 flex-shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>Mover</strong> remove este recurso da loja atual e o coloca na loja de destino. Use <strong>Clonar</strong> se quiser manter cópia em ambas.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                </div>
              ) : stores.length === 0 ? (
                <div className="py-12 text-center">
                  <StoreIcon className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">Nenhuma outra loja disponível</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-1">
                    Selecionar loja de destino
                  </p>
                  {stores.map(store => {
                    const isSelected = selectedId === store.id;
                    return (
                      <button
                        key={store.id}
                        onClick={() => setSelectedId(store.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors border',
                          isSelected
                            ? 'bg-orange-50 border-orange-200'
                            : 'border-transparent hover:bg-zinc-50'
                        )}
                      >
                        <div className={cn(
                          'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                          isSelected ? 'border-orange-500' : 'border-zinc-300'
                        )}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">{store.shop_name}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{store.shop_domain}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <div className="px-4 py-2.5 bg-red-50 border-t border-red-100 flex items-start gap-2 flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-100 flex-shrink-0">
              <button
                onClick={onClose}
                disabled={moving}
                className="px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleMove}
                disabled={moving || !selectedId}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                  'bg-zinc-900 hover:bg-zinc-800 text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {moving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Movendo...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3.5 h-3.5" />
                    Mover
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
