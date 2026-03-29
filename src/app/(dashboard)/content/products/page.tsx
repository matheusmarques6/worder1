'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Package, Search, RefreshCw, AlertCircle, Loader2, ShoppingBag } from 'lucide-react';

interface Product {
  id: string;
  title: string;
  vendor: string;
  status: string;
  price_min: number;
  price_max: number;
  image: string | null;
  product_type: string;
  variants_count: number;
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-green-100 text-green-700' },
  draft: { label: 'Rascunho', className: 'bg-gray-100 text-gray-600' },
  archived: { label: 'Arquivado', className: 'bg-red-100 text-red-600' },
};

export default function ContentProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [noStore, setNoStore] = useState(false);

  async function fetchProducts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products?limit=50');
      if (res.status === 404 || res.status === 400) {
        setNoStore(true);
        setProducts([]);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Erro ao carregar produtos');
        return;
      }
      const data = await res.json();
      // Handle both array and paginated response shapes
      const list: Product[] = Array.isArray(data) ? data : data.products ?? data.data ?? [];
      setProducts(list);
      if (list.length === 0) setNoStore(true);
    } catch {
      setError('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  const filtered = products.filter(
    p =>
      p.title?.toLowerCase().includes(search.toLowerCase()) ||
      p.vendor?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-500 mt-1">Produtos importados da sua loja</p>
        </div>
        <button
          onClick={fetchProducts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      )}

      {/* No store connected */}
      {!loading && !error && noStore && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma loja conectada</h3>
          <p className="text-sm text-gray-500 mb-6">
            Conecte sua loja Shopify para importar produtos automaticamente.
          </p>
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            Conectar Loja
          </Link>
        </div>
      )}

      {/* Products table */}
      {!loading && !error && !noStore && products.length > 0 && (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Produto</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Fornecedor</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Preço</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Variantes</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(product => {
                    const statusInfo = STATUS_LABELS[product.status] ?? {
                      label: product.status,
                      className: 'bg-gray-100 text-gray-600',
                    };
                    return (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.title}
                                className="w-8 h-8 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900 line-clamp-1">{product.title}</p>
                              {product.product_type && (
                                <p className="text-xs text-gray-400">{product.product_type}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{product.vendor || '-'}</td>
                        <td className="px-4 py-3 text-gray-900">
                          {product.price_min === product.price_max
                            ? formatPrice(product.price_min)
                            : `${formatPrice(product.price_min)} – ${formatPrice(product.price_max)}`}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{product.variants_count ?? '-'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                        Nenhum produto encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
