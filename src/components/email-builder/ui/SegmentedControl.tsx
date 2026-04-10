'use client'

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon?: React.ReactNode }[]
}

export function SegmentedControl<T extends string>({ value, onChange, options }: SegmentedControlProps<T>) {
  return (
    <div className="flex border border-zinc-200 rounded-md overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 flex items-center justify-center gap-1 h-[28px] text-[12px] font-medium transition-all duration-120 ${
            value === opt.value
              ? 'bg-zinc-900 text-white'
              : 'bg-transparent text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
