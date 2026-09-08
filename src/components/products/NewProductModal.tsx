'use client'

// =============================================================
// Novo produto — nasce na Shopify, aparece na Worder
//
// O formulário manda para POST /api/products/shopify, que cria o
// produto na Shopify (título, descrição, preço, SKU, estoque, imagens,
// publicação) e grava a linha local. A partir daí a sincronização e os
// webhooks mantêm preço/estoque/disponibilidade em dia.
//
// Sem a permissão write_products no app da Shopify a API devolve 403
// com instruções; o modal mostra o passo a passo em vez de um erro seco.
// =============================================================

import { useState } from 'react'
import { X, Plus, Trash, Image as ImageIcon, WarningCircle, CheckCircle, Spinner } from '@phosphor-icons/react'
import { MediaLibraryModal } from '@/components/shared/MediaLibraryModal'

export interface NewProductResult {
  product: any | null
  shopifyProductId: string
  warnings: string[]
}

interface NewProductModalProps {
  storeId: string
  currency: string
  onClose: () => void
  onCreated: (result: NewProductResult) => void
}

export function NewProductModal({ storeId, currency, onClose, onCreated }: NewProductModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [compareAtPrice, setCompareAtPrice] = useState('')
  const [sku, setSku] = useState('')
  const [trackInventory, setTrackInventory] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [status, setStatus] = useState<'active' | 'draft'>('active')
  const [publish, setPublish] = useState(true)
  const [vendor, setVendor] = useState('')
  const [productType, setProductType] = useState('')
  const [tags, setTags] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [showLibrary, setShowLibrary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  const priceNum = Number(String(price).replace(',', '.'))
  const canSubmit = title.trim().length > 0 && Number.isFinite(priceNum) && priceNum >= 0 && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/products/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          title: title.trim(),
          description: description.trim() || undefined,
          price: priceNum,
          compareAtPrice: compareAtPrice ? Number(String(compareAtPrice).replace(',', '.')) : null,
          sku: sku.trim() || null,
          trackInventory,
          quantity: trackInventory && quantity !== '' ? Number(quantity) : null,
          status,
          publish,
          vendor: vendor.trim() || null,
          productType: productType.trim() || null,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          imageUrls,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError({ message: data.error || `Falha ao criar (${res.status})`, hint: data.hint })
        return
      }
      onCreated({ product: data.product || null, shopifyProductId: data.shopifyProductId, warnings: data.warnings || [] })
    } catch (e: any) {
      setError({ message: e?.message || 'Erro de conexão' })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500'
  const label = 'block text-xs font-medium text-gray-700 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-produto-titulo"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 id="novo-produto-titulo" className="text-lg font-semibold text-gray-900">Novo produto</h2>
            <p className="text-xs text-gray-500 mt-0.5">Criado na Shopify e sincronizado aqui automaticamente.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
              <WarningCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{error.message}</p>
                {error.hint && <p className="text-xs text-red-600 mt-1 leading-relaxed">{error.hint}</p>}
              </div>
            </div>
          )}

          <div>
            <label className={label} htmlFor="np-title">Título *</label>
            <input id="np-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Sérum Facial Vitamina C 30ml" autoFocus />
          </div>

          <div>
            <label className={label} htmlFor="np-desc">Descrição</label>
            <textarea id="np-desc" className={`${field} min-h-[88px] resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Texto que aparece na página do produto" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label} htmlFor="np-price">Preço ({currency}) *</label>
              <input id="np-price" className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label className={label} htmlFor="np-compare">Preço comparativo</label>
              <input id="np-compare" className={field} inputMode="decimal" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="De: 0,00" />
            </div>
            <div>
              <label className={label} htmlFor="np-sku">SKU</label>
              <input id="np-sku" className={field} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Código interno" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="mt-0.5" checked={trackInventory} onChange={(e) => setTrackInventory(e.target.checked)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Controlar estoque</p>
                <p className="text-xs text-gray-500">Quando o estoque chegar a zero, o produto sai dos feeds de e-mail.</p>
                {trackInventory && (
                  <input
                    className={`${field} mt-2`}
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="Quantidade inicial"
                    aria-label="Quantidade inicial"
                  />
                )}
              </div>
            </label>
            <div className="space-y-3">
              <div>
                <label className={label} htmlFor="np-status">Status</label>
                <select id="np-status" className={field} value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'draft')}>
                  <option value="active">Ativo</option>
                  <option value="draft">Rascunho</option>
                </select>
              </div>
              <label className={`flex items-center gap-2 text-sm ${status === 'draft' ? 'text-gray-400' : 'text-gray-700'}`}>
                <input type="checkbox" checked={publish && status !== 'draft'} disabled={status === 'draft'} onChange={(e) => setPublish(e.target.checked)} />
                Publicar na Loja online
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label} htmlFor="np-vendor">Fornecedor / marca</label>
              <input id="np-vendor" className={field} value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="np-type">Tipo de produto</label>
              <input id="np-type" className={field} value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="Ex.: Skincare" />
            </div>
            <div>
              <label className={label} htmlFor="np-tags">Tags</label>
              <input id="np-tags" className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="separadas por vírgula" />
            </div>
          </div>

          <div>
            <p className={label}>Imagens</p>
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url, i) => (
                <div key={url + i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 p-1 rounded bg-white/90 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remover imagem"
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowLibrary(true)}
                className="w-20 h-20 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-brand-500 hover:text-brand-600 flex flex-col items-center justify-center gap-1 text-[11px]"
              >
                <ImageIcon size={18} />
                Adicionar
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Da biblioteca de mídia ou por URL. A primeira vira a imagem principal.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 hidden sm:block">Preço, estoque e publicação podem ser ajustados depois na Shopify — a Worder acompanha.</p>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? <Spinner size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Criando na Shopify...' : 'Criar produto'}
            </button>
          </div>
        </div>
      </div>

      {showLibrary && (
        <MediaLibraryModal
          onSelect={(url) => { if (url && !imageUrls.includes(url)) setImageUrls([...imageUrls, url]) }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  )
}

/** Resumo pós-criação (avisos de estoque/publicação), reutilizável na tela. */
export function CreatedProductNotice({ result, onDismiss }: { result: NewProductResult; onDismiss: () => void }) {
  const ok = result.warnings.length === 0
  return (
    <div className={`rounded-lg border p-3 text-sm flex gap-2 ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
      {ok ? <CheckCircle size={18} className="flex-shrink-0 mt-0.5" /> : <WarningCircle size={18} className="flex-shrink-0 mt-0.5" />}
      <div className="flex-1">
        <p className="font-medium">
          {result.product?.title ? `"${result.product.title}" criado na Shopify.` : 'Produto criado na Shopify.'}
        </p>
        {result.warnings.map((w, i) => <p key={i} className="text-xs mt-1">{w}</p>)}
      </div>
      <button onClick={onDismiss} className="p-1 rounded hover:bg-black/5" aria-label="Fechar aviso"><X size={14} /></button>
    </div>
  )
}
