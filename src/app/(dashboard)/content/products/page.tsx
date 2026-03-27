'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ShoppingBag,
  Plus,
  MagnifyingGlass,
  PencilSimple,
  Eye,
  ArrowLeft,
  Tag,
  CurrencyDollar,
  Package,
  TrendUp,
  Star,
  ArrowsClockwise,
  FunnelSimple,
  Export,
  CheckCircle,
  XCircle,
  Clock,
} from '@phosphor-icons/react'

const kpis = [
  { title: 'Total de Produtos', value: '156', icon: ShoppingBag, color: 'text-[#F26B2A]' },
  { title: 'Ativos', value: '142', icon: CheckCircle, color: 'text-emerald-400' },
  { title: 'Sem Estoque', value: '8', icon: XCircle, color: 'text-red-400' },
  { title: 'Receita (30d)', value: 'R$ 84.200', icon: CurrencyDollar, color: 'text-blue-400' },
]

const categories = ['Todos', 'Camisetas', 'Calças', 'Tênis', 'Acessórios', 'Eletrônicos']

const products = [
  { id: '1', name: 'Camiseta Premium Algodão', sku: 'CAM-001', price: 89.90, compareAt: 129.90, stock: 245, sold: 1840, category: 'Camisetas', status: 'active', rating: 4.8, image: null },
  { id: '2', name: 'Calça Jeans Slim Fit', sku: 'CAL-012', price: 199.90, compareAt: null, stock: 128, sold: 920, category: 'Calças', status: 'active', rating: 4.6, image: null },
  { id: '3', name: 'Tênis Runner Pro', sku: 'TEN-005', price: 349.90, compareAt: 449.90, stock: 56, sold: 560, category: 'Tênis', status: 'active', rating: 4.9, image: null },
  { id: '4', name: 'Boné Snapback Classic', sku: 'ACE-008', price: 59.90, compareAt: null, stock: 420, sold: 2100, category: 'Acessórios', status: 'active', rating: 4.5, image: null },
  { id: '5', name: 'Fone Bluetooth TWS', sku: 'ELE-003', price: 149.90, compareAt: 199.90, stock: 0, sold: 340, category: 'Eletrônicos', status: 'out_of_stock', rating: 4.3, image: null },
  { id: '6', name: 'Camiseta Oversized Street', sku: 'CAM-015', price: 109.90, compareAt: null, stock: 180, sold: 1250, category: 'Camisetas', status: 'active', rating: 4.7, image: null },
  { id: '7', name: 'Mochila Urban Pack', sku: 'ACE-022', price: 189.90, compareAt: 249.90, stock: 32, sold: 410, category: 'Acessórios', status: 'active', rating: 4.4, image: null },
  { id: '8', name: 'Calça Cargo Tactical', sku: 'CAL-019', price: 229.90, compareAt: null, stock: 0, sold: 280, category: 'Calças', status: 'out_of_stock', rating: 4.2, image: null },
  { id: '9', name: 'Smartwatch Fit Band', sku: 'ELE-007', price: 299.90, compareAt: 399.90, stock: 18, sold: 620, category: 'Eletrônicos', status: 'active', rating: 4.6, image: null },
  { id: '10', name: 'Tênis Casual Day', sku: 'TEN-011', price: 249.90, compareAt: null, stock: 95, sold: 780, category: 'Tênis', status: 'active', rating: 4.5, image: null },
  { id: '11', name: 'Camiseta Polo Executive', sku: 'CAM-020', price: 139.90, compareAt: null, stock: 64, sold: 890, category: 'Camisetas', status: 'draft', rating: 0, image: null },
  { id: '12', name: 'Relógio Analógico Classic', sku: 'ACE-030', price: 459.90, compareAt: 599.90, stock: 12, sold: 156, category: 'Acessórios', status: 'active', rating: 4.8, image: null },
]

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400' },
  out_of_stock: { label: 'Sem Estoque', color: 'bg-red-500/10 text-red-400' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-zinc-400' },
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')
  const [sortBy, setSortBy] = useState<'name' | 'sold' | 'price' | 'stock'>('sold')

  const filtered = products
    .filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
      const matchCategory = category === 'Todos' || p.category === category
      return matchSearch && matchCategory
    })
    .sort((a, b) => {
      if (sortBy === 'sold') return b.sold - a.sold
      if (sortBy === 'price') return b.price - a.price
      if (sortBy === 'stock') return b.stock - a.stock
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/content" className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center">
            <ShoppingBag size={22} className="text-[#F26B2A]" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Produtos</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Catálogo sincronizado da sua loja</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <ArrowsClockwise size={14} />
            Sincronizar
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <Export size={14} />
            Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={kpi.color} />
                <span className="text-xs text-zinc-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#F26B2A]"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                category === cat ? 'bg-[#F26B2A] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
        >
          <option value="sold">Mais vendidos</option>
          <option value="price">Maior preço</option>
          <option value="stock">Mais estoque</option>
          <option value="name">Nome A-Z</option>
        </select>
      </div>

      {/* Products Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs text-zinc-500 font-medium p-4 pb-3">Produto</th>
              <th className="text-left text-xs text-zinc-500 font-medium p-4 pb-3">SKU</th>
              <th className="text-left text-xs text-zinc-500 font-medium p-4 pb-3">Status</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Preço</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Estoque</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Vendidos</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Avaliação</th>
              <th className="text-right text-xs text-zinc-500 font-medium p-4 pb-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => {
              const status = statusConfig[product.status]
              return (
                <tr key={product.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <Package size={18} className="text-zinc-600" />
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{product.name}</p>
                        <p className="text-xs text-zinc-600">{product.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <code className="text-xs text-zinc-400 font-mono">{product.sku}</code>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <p className="text-sm text-white font-medium">R$ {product.price.toFixed(2)}</p>
                    {product.compareAt && (
                      <p className="text-xs text-zinc-600 line-through">R$ {product.compareAt.toFixed(2)}</p>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <span className={`text-sm ${product.stock === 0 ? 'text-red-400' : product.stock < 20 ? 'text-yellow-400' : 'text-zinc-400'}`}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-zinc-400 text-right">
                    {product.sold.toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4 text-right">
                    {product.rating > 0 ? (
                      <div className="flex items-center gap-1 justify-end">
                        <Star size={12} className="text-yellow-400" weight="fill" />
                        <span className="text-sm text-zinc-400">{product.rating}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button className="p-1.5 rounded hover:bg-zinc-800 transition-colors">
                        <Eye size={14} className="text-zinc-500" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-zinc-800 transition-colors">
                        <PencilSimple size={14} className="text-zinc-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sync Info */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowsClockwise size={18} className="text-zinc-500" />
          <div>
            <p className="text-sm text-zinc-400">Última sincronização: <span className="text-white">há 2 horas</span></p>
            <p className="text-xs text-zinc-600">Sincronização automática a cada 6 horas via Shopify</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-400">Conectado</span>
        </div>
      </div>
    </div>
  )
}
