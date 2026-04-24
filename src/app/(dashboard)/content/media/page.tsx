'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Copy,
  Loader2,
  X,
  Check,
  Search,
  RefreshCw,
} from 'lucide-react';
import { useStoreStore } from '@/stores';

interface MediaFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  created_at: string;
  storage_path: string;
  store_id?: string | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentStore } = useStoreStore();

  const fetchFiles = useCallback(async () => {
    if (!currentStore?.id) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (currentStore?.id) params.set('store_id', currentStore.id);
      const res = await fetch(`/api/content/media?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentStore?.id]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      try {
        for (const file of Array.from(fileList)) {
          const form = new FormData();
          form.append('file', file);
          if (currentStore?.id) form.append('store_id', currentStore.id);

          const res = await fetch('/api/content/media', {
            method: 'POST',
            body: form,
          });
          if (res.ok) {
            const saved = await res.json();
            setFiles((prev) => [saved, ...prev]);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [currentStore?.id]
  );

  const handleDelete = useCallback(async (file: MediaFile) => {
    if (!confirm('Tem certeza que deseja excluir esta mídia?')) return;
    setDeletingId(file.id);
    try {
      const res = await fetch('/api/content/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: file.storage_path, id: file.id }),
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        if (selectedFile?.id === file.id) setSelectedFile(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  }, [selectedFile]);

  const handleCopyUrl = useCallback((file: MediaFile) => {
    navigator.clipboard.writeText(file.url).catch(() => {});
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Biblioteca de Midia</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie imagens e arquivos para suas campanhas
            {currentStore && (
              <span className="ml-1 text-brand-600 font-medium">
                — {currentStore.name || 'Loja selecionada'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFiles}
            className="p-2.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? 'Enviando...' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Search + Drop Zone */}
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar arquivos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-brand-400 bg-brand-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Arraste arquivos aqui ou{' '}
            <span className="text-brand-500 font-medium">clique para selecionar</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WebP, SVG — Máximo 10MB</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {search ? 'Nenhuma midia encontrada' : 'Nenhuma midia'}
          </h3>
          <p className="text-sm text-gray-500">
            {search
              ? 'Tente ajustar sua busca'
              : 'Faca upload da sua primeira imagem usando o botao acima ou arrastando aqui'}
          </p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Grid */}
          <div className="flex-1">
            <p className="text-xs text-gray-400 mb-3">
              {filtered.length} {filtered.length === 1 ? 'arquivo' : 'arquivos'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={`bg-white border rounded-lg overflow-hidden hover:shadow-md transition-all cursor-pointer group ${
                    selectedFile?.id === file.id
                      ? 'border-brand-500 ring-2 ring-brand-500/20'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="relative aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                    {file.type?.startsWith('image') ? (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    )}
                    {/* Quick actions overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyUrl(file);
                        }}
                        title="Copiar URL"
                        className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                      >
                        {copiedId === file.id ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-700" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file);
                        }}
                        disabled={deletingId === file.id}
                        title="Excluir"
                        className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deletingId === file.id ? (
                          <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-medium text-gray-800 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatBytes(file.size)}
                      {file.created_at ? ` · ${formatDate(file.created_at)}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          {selectedFile && (
            <div className="w-72 shrink-0 bg-white border border-gray-200 rounded-xl p-4 h-fit sticky top-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Detalhes</h3>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedFile.type?.startsWith('image') && (
                <div className="aspect-video bg-gray-50 rounded-lg overflow-hidden mb-4 border border-gray-100">
                  <img
                    src={selectedFile.url}
                    alt={selectedFile.name}
                    className="w-full h-full object-contain"
                  />
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
                    {copiedId === selectedFile.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar URL
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(selectedFile)}
                    disabled={deletingId === selectedFile.id}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingId === selectedFile.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
