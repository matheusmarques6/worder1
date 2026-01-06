/**
 * DateRangePicker - Seletor de período
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { DateRange, DATE_PRESETS, formatDateRange } from '@/types/facebook';
import { Calendar, ChevronDown, X } from 'lucide-react';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [tempFrom, setTempFrom] = useState(value.from);
  const [tempTo, setTempTo] = useState(value.to);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setCustomMode(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePresetClick = (preset: typeof DATE_PRESETS[0]) => {
    const newRange = preset.getValue();
    onChange(newRange);
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    if (tempFrom && tempTo) {
      onChange({ from: tempFrom, to: tempTo });
      setIsOpen(false);
      setCustomMode(false);
    }
  };

  // Encontrar preset atual
  const currentPreset = DATE_PRESETS.find(preset => {
    const presetRange = preset.getValue();
    return presetRange.from === value.from && presetRange.to === value.to;
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-sm"
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-gray-700">
          {currentPreset ? currentPreset.label : formatDateRange(value)}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          {!customMode ? (
            <>
              {/* Presets */}
              <div className="p-2">
                {DATE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePresetClick(preset)}
                    className={`
                      w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                      ${currentPreset?.label === preset.label 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'hover:bg-gray-50 text-gray-700'
                      }
                    `}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="border-t border-gray-100" />

              {/* Opção personalizada */}
              <div className="p-2">
                <button
                  onClick={() => {
                    setCustomMode(true);
                    setTempFrom(value.from);
                    setTempTo(value.to);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50 text-gray-700"
                >
                  Personalizado...
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Modo personalizado */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-medium text-gray-900">Período personalizado</span>
                  <button
                    onClick={() => setCustomMode(false)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Data início</label>
                    <input
                      type="date"
                      value={tempFrom}
                      onChange={(e) => setTempFrom(e.target.value)}
                      max={tempTo}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Data fim</label>
                    <input
                      type="date"
                      value={tempTo}
                      onChange={(e) => setTempTo(e.target.value)}
                      min={tempFrom}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleCustomApply}
                  disabled={!tempFrom || !tempTo}
                  className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Aplicar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
