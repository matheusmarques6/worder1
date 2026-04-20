'use client';
import { useState, useEffect } from 'react';
import { MessageCircle, Search, RefreshCw } from 'lucide-react';

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch('/api/whatsapp/templates');
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const filtered = templates.filter(
    (t) => !search || t.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Templates WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">
            Templates aprovados para mensagens do WhatsApp Business
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum template encontrado</h3>
          <p className="text-sm text-gray-500">
            Templates WhatsApp são criados e aprovados via WhatsApp Business
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template: any) => (
            <div
              key={template.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">{template.name}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    template.status === 'APPROVED'
                      ? 'bg-green-100 text-green-700'
                      : template.status === 'PENDING'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {template.status || 'Rascunho'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                {template.body || template.content || 'Sem conteúdo'}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {template.category || template.language || 'geral'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
