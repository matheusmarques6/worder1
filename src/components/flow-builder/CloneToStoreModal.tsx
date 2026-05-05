'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check, AlertCircle, Store as StoreIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Store {
  id: string;
  shop_name: string;
  shop_domain: string;
  is_active: boolean;
}

interface CloneToStoreModalProps {
  open: boolean;
  onClose: () => void;
  automationId: string;
  automationName: string;
  currentStoreId?: string;
  onCloned?: (clonedCount: number) => void;
}

export function CloneToStoreModal({
  open,
  onClose,
  automationId,
  automationName,
  currentStoreId,
  onCloned,
}: CloneToStoreModalProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  // Fetch available stores when modal opens
  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setSelectedIds(new Set());
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

  const toggleStore = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClone = async () => {
    if (selectedIds.size === 0) {
      setError('Selecione pelo menos uma loja');
      return;
    }
    setCloning(true);
    setError('');
    try {
      const res = await fetch(`/api/automations/${automationId}/clone-to-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStoreIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao clonar');
        return;
      }
      setResult(data);
      onCloned?.(data.cloned || 0);
    } catch (err: any) {
      setError(err.message || 'Erro ao clonar');
    } finally {
      setCloning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={cloning ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Clonar para outra loja</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[300px]">{automationName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={cloning}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-emerald-600" strokeWidth={2.5} />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 mb-1">
              Automação clonada
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              {result.cloned} loja{result.cloned !== 1 ? 's' : ''} · {result.templatesCloned} template{result.templatesCloned !== 1 ? 's' : ''} duplicado{result.templatesCloned !== 1 ? 's' : ''}
            </p>
            {result.failed > 0 && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-left">
                <p className="text-xs font-medium text-amber-800 mb-1">
                  {result.failed} loja{result.failed !== 1 ? 's' : ''} com erro:
                </p>
                {(result.results || []).filter((r: any) => r.error).map((r: any) => (
                  <p key={r.storeId} className="text-[11px] text-amber-700">
                    {r.storeName || r.storeId}: {r.error}
                  </p>
                ))}
              </div>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-md transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                </div>
              ) : stores.length === 0 ? (
                <div className="py-12 text-center">
                  <StoreIcon className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">Nenhuma outra loja disponível</p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Conecte outra loja Shopify para clonar entre elas
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-2 mb-1">
                    Selecionar lojas de destino
                  </p>
                  {stores.map(store => {
                    const isSelected = selectedIds.has(store.id);
                    return (
                      <button
                        key={store.id}
                        onClick={() => toggleStore(store.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors border',
                          isSelected
                            ? 'bg-orange-50 border-orange-200'
                            : 'border-transparent hover:bg-zinc-50'
                        )}
                      >
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-orange-500 border-orange-500'
                            : 'border-zinc-300'
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
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

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-100 flex-shrink-0">
              <p className="text-[11px] text-zinc-500">
                {selectedIds.size > 0 ? `${selectedIds.size} loja${selectedIds.size > 1 ? 's' : ''} selecionada${selectedIds.size > 1 ? 's' : ''}` : 'Nenhuma seleção'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={cloning}
                  className="px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClone}
                  disabled={cloning || selectedIds.size === 0}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                    'bg-zinc-900 hover:bg-zinc-800 text-white',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {cloning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Clonando...
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Clonar
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
