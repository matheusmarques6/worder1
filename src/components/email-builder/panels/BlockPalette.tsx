'use client'

import { BLOCK_DEFS, type BlockDef } from '../config/types'

interface BlockPaletteProps {
  onAddBlock: (type: string) => void
}

export function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  const categories = Array.from(new Set(BLOCK_DEFS.map(b => b.category)))

  const handleDragStart = (e: React.DragEvent, def: BlockDef) => {
    e.dataTransfer.setData('blockType', def.type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="space-y-4">
      {categories.map(cat => (
        <div key={cat}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">{cat}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BLOCK_DEFS.filter(b => b.category === cat).map(def => (
              <button
                key={def.type}
                onClick={() => onAddBlock(def.type)}
                draggable
                onDragStart={(e) => handleDragStart(e, def)}
                className="flex flex-col items-center justify-center gap-1 p-3 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing text-center"
              >
                <span className="text-lg leading-none">{def.icon}</span>
                <span className="text-[10px] font-medium text-gray-600 leading-tight">{def.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
