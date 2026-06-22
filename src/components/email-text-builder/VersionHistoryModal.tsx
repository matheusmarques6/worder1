'use client';

// =============================================================
// Worder text email editor — version history modal.
//
// Lists the auto-snapshots captured by the email_template_versions
// trigger and lets the user restore one. Restore is a server-side
// UPDATE that itself snapshots the current state first, so restoring is
// reversible.
// =============================================================

import { useEffect, useState, useCallback } from 'react';
import { X, RotateCcw, History, Loader2, Type, LayoutGrid } from 'lucide-react';

interface VersionRow {
  id: string;
  version: number;
  editor_type?: string | null;
  comment?: string | null;
  created_at: string;
}

interface VersionHistoryModalProps {
  templateId: string;
  onClose: () => void;
  /** Called with the restored template row (includes design_json + html). */
  onRestored: (template: any) => void;
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora há pouco';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

export function VersionHistoryModal({ templateId, onClose, onRestored }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/email/templates/${templateId}/versions`);
      if (!res.ok) throw new Error('Falha ao carregar histórico');
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  const restore = useCallback(async (version: number) => {
    setRestoringVersion(version);
    setError('');
    try {
      const res = await fetch(`/api/email/templates/${templateId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Falha ao restaurar');
      }
      const data = await res.json();
      onRestored(data.template);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao restaurar versão');
      setRestoringVersion(null);
    }
  }, [templateId, onRestored, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-900">Histórico de versões</h3>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="px-5 py-8 text-center text-sm text-red-600">{error}</div>
          ) : versions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <History className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Nenhuma versão anterior ainda.</p>
              <p className="text-xs text-zinc-400 mt-1">As versões são capturadas conforme você edita.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {versions.map((v) => {
                const Icon = v.editor_type === 'text' ? Type : LayoutGrid;
                return (
                  <li key={v.id} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50">
                    <span className="flex items-center justify-center w-8 h-8 rounded border border-zinc-200 bg-zinc-50 text-zinc-500 shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-800">Versão {v.version}</p>
                      <p className="text-xs text-zinc-400">{timeAgo(v.created_at)} · {new Date(v.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <button
                      onClick={() => restore(v.version)}
                      disabled={restoringVersion !== null}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white hover:text-blue-600 border border-zinc-200 rounded-md transition-colors disabled:opacity-50"
                    >
                      {restoringVersion === v.version ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Restaurar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50">
          <p className="text-[11px] text-zinc-400">Restaurar uma versão também salva a atual — você pode desfazer.</p>
        </div>
      </div>
    </div>
  );
}

export default VersionHistoryModal;
