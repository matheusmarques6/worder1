'use client';

// =============================================================
// Biblioteca de mídia (página)
//
// O que mudou e por quê:
//   • Upload em lote de verdade: três arquivos por vez, com progresso
//     "3/7" e a lista do que falhou e por quê. Antes subia um a um e
//     qualquer erro era engolido — a pessoa soltava cinco imagens, via
//     três aparecerem e não sabia o que tinha acontecido com as outras.
//   • Seleção múltipla para excluir. Só existia o excluir de uma por
//     vez; limpar vinte imagens antigas eram vinte confirmações.
//   • Sem loja selecionada, a página dizia isso em vez de girar para
//     sempre (o fetch voltava cedo e nunca desligava o loading).
// =============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Image as ImageIcon, Upload, Trash2, Copy, Loader2, X, Check, Search,
  RefreshCw, CheckSquare, Square, AlertCircle, Store,
} from 'lucide-react';
import { useStoreStore } from '@/stores';
import {
  uploadMediaFiles, deleteMediaFiles, summarizeUpload,
  MEDIA_ACCEPT, type MediaFile, type UploadFailure,
} from '@/lib/media/upload';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);

  // Upload em lote
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set());

  // Seleção múltipla
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const { currentStore } = useStoreStore();
  const hasHydrated = useStoreStore((s) => s._hasHydrated);

  const fetchFiles = useCallback(async () => {
    // Sem loja não há o que listar — mas a tela precisa dizer isso, não
    // girar para sempre.
    if (!currentStore?.id) { setFiles([]); setLoading(false); return; }
    try {
      setLoading(true);
      const params = new URLSearchParams({ store_id: currentStore.id });
      const res = await fetch(`/api/content/media?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else {
        setNotice('Não foi possível carregar a biblioteca.');
      }
    } catch (e) {
      console.error(e);
      setNotice('Não foi possível carregar a biblioteca.');
    } finally {
      setLoading(false);
    }
  }, [currentStore?.id]);

  useEffect(() => {
    if (!hasHydrated) return;
    fetchFiles();
  }, [fetchFiles, hasHydrated]);

  const handleUpload = useCallback(async (list: FileList | File[] | null) => {
    const arquivos = list ? Array.from(list) : [];
    if (arquivos.length === 0) return;
    setUploading(true);
    setNotice(null);
    setFailures([]);
    setProgress({ done: 0, total: arquivos.length });
    try {
      const result = await uploadMediaFiles(arquivos, currentStore?.id, (done, total) =>
        setProgress({ done, total })
      );
      if (result.uploaded.length > 0) {
        setFiles((prev) => [...result.uploaded, ...prev]);
        setRecentIds(new Set(result.uploaded.map((f) => f.id)));
      }
      setFailures(result.failed);
      setNotice(summarizeUpload(result));
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [currentStore?.id]);

  const handleDeleteOne = useCallback(async (file: MediaFile) => {
    if (!confirm(`Excluir "${file.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(file.id);
    try {
      const { deleted } = await deleteMediaFiles([file.storage_path]);
      if (deleted.includes(file.storage_path)) {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        if (selectedFile?.id === file.id) setSelectedFile(null);
        setSelected((prev) => { const n = new Set(prev); n.delete(file.id); return n; });
      } else {
        setNotice('Não foi possível excluir o arquivo.');
      }
    } finally {
      setDeletingId(null);
    }
  }, [selectedFile]);

  const handleDeleteSelected = useCallback(async () => {
    const alvo = files.filter((f) => selected.has(f.id));
    if (alvo.length === 0) return;
    const ok = confirm(
      alvo.length === 1
        ? `Excluir "${alvo[0].name}"? Esta ação não pode ser desfeita.`
        : `Excluir ${alvo.length} arquivos? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const { deleted, failed } = await deleteMediaFiles(alvo.map((f) => f.storage_path));
      const apagados = new Set(deleted);
      setFiles((prev) => prev.filter((f) => !apagados.has(f.storage_path)));
      if (selectedFile && apagados.has(selectedFile.storage_path)) setSelectedFile(null);
      setSelected(new Set());
      setSelectMode(false);
      setNotice(
        failed.length === 0
          ? `${deleted.length} ${deleted.length === 1 ? 'arquivo excluído' : 'arquivos excluídos'}`
          : `${deleted.length} excluídos · ${failed.length} não puderam ser excluídos`
      );
    } finally {
      setDeleting(false);
    }
  }, [files, selected, selectedFile]);

  const handleCopyUrl = useCallback((file: MediaFile) => {
    navigator.clipboard.writeText(file.url).catch(() => {});
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const toggleSelected = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Drop na página inteira, com contador para o dragleave dos filhos não
  // apagar o destaque a cada pixel.
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); dragDepth.current += 1;
    if (e.dataTransfer.types.includes('Files')) setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragDepth.current = 0; setDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  const filtered = useMemo(
    () => files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())),
    [files, search]
  );

  const semLoja = hasHydrated && !currentStore?.id;

  return (
    <div
      className="p-6 space-y-6 min-h-full relative"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && !uploading && !semLoja && (
        <div className="fixed inset-0 z-40 bg-brand-50/90 border-4 border-dashed border-brand-400 flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-12 h-12 text-brand-500 mb-3" />
          <p className="text-base font-semibold text-brand-700">Solte para enviar</p>
          <p className="text-sm text-brand-600 mt-1">Pode soltar várias de uma vez</p>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Biblioteca de Mídia</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie imagens e arquivos para suas campanhas
            {currentStore && (
              <span className="ml-1 text-brand-600 font-medium">— {currentStore.name || 'Loja selecionada'}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFiles}
            disabled={semLoja}
            className="p-2.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || semLoja}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading && progress ? `Enviando ${progress.done}/${progress.total}` : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={MEDIA_ACCEPT}
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Avisos: progresso, resumo, falhas */}
      {(uploading || notice || failures.length > 0) && (
        <div className="space-y-2">
          {uploading && progress && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-md">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
              />
            </div>
          )}
          {!uploading && notice && (
            <div className="flex items-center justify-between gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 max-w-xl">
              <span>{notice}</span>
              <button onClick={() => { setNotice(null); setFailures([]); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {!uploading && failures.length > 0 && (
            <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5 max-w-xl">
              {failures.slice(0, 6).map((f) => (
                <li key={f.name} className="flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span><strong className="font-medium">{f.name}</strong>: {f.reason}</span>
                </li>
              ))}
              {failures.length > 6 && <li>… e mais {failures.length - 6}</li>}
            </ul>
          )}
        </div>
      )}

      {semLoja ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Selecione uma loja</h3>
          <p className="text-sm text-gray-500">
            A biblioteca é por loja. Escolha uma no menu lateral para ver e enviar imagens.
          </p>
        </div>
      ) : (
        <>
          {/* Busca + zona de drop + ações de seleção */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar arquivos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              {files.length > 0 && (
                selectMode ? (
                  <>
                    <button
                      onClick={() => setSelected(new Set(filtered.map((f) => f.id)))}
                      className="px-3 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Selecionar todos ({filtered.length})
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={selected.size === 0 || deleting}
                      className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Excluir {selected.size > 0 ? `(${selected.size})` : ''}
                    </button>
                    <button
                      onClick={() => { setSelectMode(false); setSelected(new Set()); }}
                      className="px-3 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setSelectMode(true); setSelectedFile(null); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <CheckSquare className="w-4 h-4" /> Selecionar
                  </button>
                )
              )}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                Arraste um ou vários arquivos aqui ou{' '}
                <span className="text-brand-500 font-medium">clique para selecionar</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP, SVG — máximo 10 MB cada</p>
            </div>
          </div>

          {/* Conteúdo */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {search ? 'Nenhuma mídia encontrada' : 'Nenhuma mídia'}
              </h3>
              <p className="text-sm text-gray-500">
                {search ? 'Tente ajustar sua busca' : 'Faça upload da sua primeira imagem usando o botão acima ou arrastando aqui'}
              </p>
            </div>
          ) : (
            <div className="flex gap-6">
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-3">
                  {filtered.length} {filtered.length === 1 ? 'arquivo' : 'arquivos'}
                  {selectMode && ` · ${selected.size} ${selected.size === 1 ? 'selecionado' : 'selecionados'}`}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {filtered.map((file) => {
                    const isSel = selected.has(file.id);
                    const isNew = recentIds.has(file.id);
                    const isDetail = !selectMode && selectedFile?.id === file.id;
                    return (
                      <div
                        key={file.id}
                        onClick={() => (selectMode ? toggleSelected(file.id) : setSelectedFile(file))}
                        className={`bg-white border rounded-lg overflow-hidden hover:shadow-md transition-all cursor-pointer group ${
                          isSel ? 'border-brand-500 ring-2 ring-brand-500/30'
                            : isDetail ? 'border-brand-500 ring-2 ring-brand-500/20'
                            : isNew ? 'border-emerald-400'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="relative aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                          {file.type?.startsWith('image') ? (
                            <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-gray-300" />
                          )}

                          {selectMode ? (
                            <>
                              <div className={`absolute inset-0 ${isSel ? 'bg-brand-500/15' : 'bg-black/0 group-hover:bg-black/10'}`} />
                              <div className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center shadow ${isSel ? 'bg-brand-500 text-white' : 'bg-white/95 text-gray-400'}`}>
                                {isSel ? <Check className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                              </div>
                            </>
                          ) : (
                            <>
                              {isNew && (
                                <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white rounded">
                                  nova
                                </span>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCopyUrl(file); }}
                                  title="Copiar URL"
                                  className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                                >
                                  {copiedId === file.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-700" />}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteOne(file); }}
                                  disabled={deletingId === file.id}
                                  title="Excluir"
                                  className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors disabled:opacity-50"
                                >
                                  {deletingId === file.id ? <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-[11px] font-medium text-gray-800 truncate" title={file.name}>{file.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {formatBytes(file.size)}{file.created_at ? ` · ${formatDate(file.created_at)}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Painel de detalhes (fora do modo de seleção) */}
              {selectedFile && !selectMode && (
                <div className="w-72 shrink-0 bg-white border border-gray-200 rounded-xl p-4 h-fit sticky top-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Detalhes</h3>
                    <button onClick={() => setSelectedFile(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedFile.type?.startsWith('image') && (
                    <div className="aspect-video bg-gray-50 rounded-lg overflow-hidden mb-4 border border-gray-100">
                      <img src={selectedFile.url} alt={selectedFile.name} className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Nome</p>
                      <p className="text-xs text-gray-800 mt-0.5 break-all">{selectedFile.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Tamanho</p>
                      <p className="text-xs text-gray-800 mt-0.5">{formatBytes(selectedFile.size)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Tipo</p>
                      <p className="text-xs text-gray-800 mt-0.5">{selectedFile.type}</p>
                    </div>
                    {selectedFile.created_at && (
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Data</p>
                        <p className="text-xs text-gray-800 mt-0.5">{formatDate(selectedFile.created_at)}</p>
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <button
                        onClick={() => handleCopyUrl(selectedFile)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                      >
                        {copiedId === selectedFile.id ? <><Check className="w-3.5 h-3.5 text-green-600" />Copiado!</> : <><Copy className="w-3.5 h-3.5" />Copiar URL</>}
                      </button>
                      <button
                        onClick={() => handleDeleteOne(selectedFile)}
                        disabled={deletingId === selectedFile.id}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === selectedFile.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
