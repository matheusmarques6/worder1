'use client'

// SegmentTemplateGallery — clickable cards on the segments empty
// state. Each card hydrates the builder with a ready-made v2 rule.

import { useEffect, useState } from 'react'
import type { SegmentTemplate } from '@/lib/segments/templates'

interface Props {
  onPick: (template: SegmentTemplate) => void
}

export function SegmentTemplateGallery({ onPick }: Props) {
  const [templates, setTemplates] = useState<SegmentTemplate[]>([])
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [activeCategory, setActiveCategory] = useState<string>('all')

  useEffect(() => {
    fetch('/api/segments/templates')
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates || [])
        setCategories(d.categories || {})
      })
      .catch(() => {})
  }, [])

  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter((t) => t.category === activeCategory)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Comece com um template</h3>
        <div className="flex gap-1">
          {(['all', ...Object.keys(categories)] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                activeCategory === cat
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat === 'all' ? 'Todos' : categories[cat]}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-brand-500 hover:shadow-sm transition-all group"
          >
            <div className="text-2xl mb-2">{t.emoji}</div>
            <h4 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">{t.name}</h4>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-2">
              {categories[t.category]}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
