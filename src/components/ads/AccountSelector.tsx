/**
 * AccountSelector - Seletor de contas Meta
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { MetaAdAccount } from '@/types/facebook';
import { Check, ChevronDown, AlertCircle, Plus, X, RefreshCw } from 'lucide-react';

interface AccountSelectorProps {
  accounts: MetaAdAccount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onConnect?: () => void;
  onSync?: () => Promise<any>;
  syncing?: boolean;
  loading?: boolean;
}

export function AccountSelector({ 
  accounts,
  selectedIds,
  onChange,
  onConnect,
  onSync,
  syncing,
  loading
}: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAccount = (accountId: string) => {
    if (selectedIds.includes(accountId)) {
      onChange(selectedIds.filter(id => id !== accountId));
    } else {
      onChange([...selectedIds, accountId]);
    }
  };

  const selectAll = () => {
    const activeIds = accounts.filter(a => a.is_active && a.status === 'connected').map(a => a.id);
    onChange(activeIds);
  };

  const clearAll = () => {
    onChange([]);
  };

  const activeAccounts = accounts.filter(a => a.is_active && a.status === 'connected');
  const expiredAccounts = accounts.filter(a => a.status === 'expired' || a.warnings?.token_expired);

  // Texto do botão
  const getButtonText = () => {
    if (loading) return 'Carregando...';
    if (selectedIds.length === 0) return 'Selecionar contas';
    if (selectedIds.length === activeAccounts.length) return `Todas as contas (${selectedIds.length})`;
    return `${selectedIds.length} conta${selectedIds.length > 1 ? 's' : ''} selecionada${selectedIds.length > 1 ? 's' : ''}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-sm disabled:opacity-50"
      >
        <span className="text-gray-700">{getButtonText()}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          {/* Header */}
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Contas de anúncios</span>
            <div className="flex items-center gap-2">
              {onSync && (
                <button
                  onClick={() => onSync()}
                  disabled={syncing}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Sincronizar contas"
                >
                  <RefreshCw className={`w-4 h-4 text-gray-500 ${syncing ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={selectAll}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Todas
              </button>
              <button
                onClick={clearAll}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Lista de contas */}
          <div className="max-h-64 overflow-y-auto py-1">
            {accounts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-500">Nenhuma conta conectada</p>
              </div>
            ) : (
              <>
                {/* Contas ativas */}
                {activeAccounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(account.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <div className={`
                      w-5 h-5 rounded border flex items-center justify-center flex-shrink-0
                      ${selectedIds.includes(account.id) 
                        ? 'bg-blue-600 border-blue-600' 
                        : 'border-gray-300'
                      }
                    `}>
                      {selectedIds.includes(account.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {account.ad_account_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {account.ad_account_id} • {account.currency}
                      </div>
                    </div>
                    {account.warnings?.token_expiring_soon && (
                      <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" title="Token expirando em breve" />
                    )}
                  </button>
                ))}

                {/* Contas com problema */}
                {expiredAccounts.length > 0 && (
                  <>
                    <div className="px-3 py-2 border-t border-gray-100">
                      <span className="text-xs font-medium text-red-600 uppercase">Reconexão necessária</span>
                    </div>
                    {expiredAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="w-full flex items-center gap-3 px-3 py-2 bg-red-50"
                      >
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {account.ad_account_name}
                          </div>
                          <div className="text-xs text-red-600">
                            Token expirado
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {onConnect && (
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onConnect();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Conectar nova conta
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AccountSelector;
