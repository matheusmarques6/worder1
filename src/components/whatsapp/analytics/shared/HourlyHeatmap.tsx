'use client';

import { motion } from 'framer-motion';
import { Clock, TrendingUp } from 'lucide-react';

interface HourlyData {
  hour: number;
  sent?: number;
  delivered?: number;
  read?: number;
  interactions?: number;
  delivery_rate?: number;
  read_rate?: number;
  success_rate?: number;
  avg_latency_ms?: number;
}

interface HourlyHeatmapProps {
  data: HourlyData[];
  metric?: 'read_rate' | 'delivery_rate' | 'success_rate' | 'interactions';
  title?: string;
  bestHour?: { hour: number; rate: number } | null;
}

export function HourlyHeatmap({ 
  data, 
  metric = 'read_rate', 
  title = 'Distribuição por Hora',
  bestHour 
}: HourlyHeatmapProps) {
  const getValue = (item: HourlyData): number => {
    switch (metric) {
      case 'read_rate':
        return item.read_rate ?? 0;
      case 'delivery_rate':
        return item.delivery_rate ?? 0;
      case 'success_rate':
        return item.success_rate ?? 0;
      case 'interactions':
        return item.interactions ?? item.sent ?? 0;
      default:
        return 0;
    }
  };

  const maxValue = Math.max(...data.map(getValue), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.6 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        {bestHour && (
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-dark-400">Melhor hora:</span>
            <span className="text-emerald-400 font-medium">
              {bestHour.hour.toString().padStart(2, '0')}h ({bestHour.rate.toFixed(1)}%)
            </span>
          </div>
        )}
      </div>

      {/* Heatmap Grid */}
      <div className="relative">
        <div className="grid grid-cols-24 gap-1">
          {data.map((item, index) => {
            const value = getValue(item);
            const intensity = maxValue > 0 ? value / maxValue : 0;
            const bgColor = getHeatmapColor(intensity, metric);
            
            return (
              <motion.div
                key={item.hour}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: index * 0.01 }}
                className={`h-12 rounded-md ${bgColor} cursor-pointer group relative`}
                title={`${item.hour}h: ${metric === 'interactions' ? value.toLocaleString() : value.toFixed(1) + '%'}`}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  <p className="font-medium text-white">{item.hour.toString().padStart(2, '0')}:00</p>
                  {item.sent !== undefined && (
                    <p className="text-dark-300">Enviadas: {item.sent?.toLocaleString()}</p>
                  )}
                  {item.delivered !== undefined && (
                    <p className="text-dark-300">Entregues: {item.delivered?.toLocaleString()}</p>
                  )}
                  {item.read !== undefined && (
                    <p className="text-dark-300">Lidas: {item.read?.toLocaleString()}</p>
                  )}
                  {item.interactions !== undefined && (
                    <p className="text-dark-300">Interações: {item.interactions?.toLocaleString()}</p>
                  )}
                  {item.delivery_rate !== undefined && (
                    <p className="text-emerald-400">Taxa entrega: {item.delivery_rate.toFixed(1)}%</p>
                  )}
                  {item.read_rate !== undefined && (
                    <p className="text-cyan-400">Taxa leitura: {item.read_rate.toFixed(1)}%</p>
                  )}
                  {item.success_rate !== undefined && (
                    <p className="text-emerald-400">Taxa sucesso: {item.success_rate.toFixed(1)}%</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Hour labels */}
        <div className="grid grid-cols-24 gap-1 mt-2">
          {[0, 6, 12, 18, 23].map((hour) => (
            <div
              key={hour}
              className="text-xs text-dark-400 text-center"
              style={{ gridColumn: hour + 1 }}
            >
              {hour}h
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-dark-400">Baixo</span>
          <div className="flex gap-0.5">
            {['bg-dark-700', 'bg-emerald-900/40', 'bg-emerald-700/50', 'bg-emerald-600/60', 'bg-emerald-500/80'].map((color, i) => (
              <div key={i} className={`w-6 h-3 ${color} rounded`} />
            ))}
          </div>
          <span className="text-xs text-dark-400">Alto</span>
        </div>

        {/* Stats summary */}
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-dark-400">Pico: </span>
            <span className="text-white font-medium">
              {findPeakHour(data, metric)}
            </span>
          </div>
          <div>
            <span className="text-dark-400">Baixa: </span>
            <span className="text-white font-medium">
              {findLowHour(data, metric)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getHeatmapColor(intensity: number, metric: string): string {
  if (metric === 'interactions') {
    // Escala roxa para interações
    if (intensity < 0.1) return 'bg-dark-700';
    if (intensity < 0.25) return 'bg-purple-900/30';
    if (intensity < 0.5) return 'bg-purple-700/40';
    if (intensity < 0.75) return 'bg-purple-600/60';
    return 'bg-purple-500/80';
  }
  
  // Escala verde para taxas
  if (intensity < 0.2) return 'bg-red-900/30';
  if (intensity < 0.4) return 'bg-orange-800/40';
  if (intensity < 0.6) return 'bg-yellow-700/50';
  if (intensity < 0.8) return 'bg-emerald-700/60';
  return 'bg-emerald-500/80';
}

function findPeakHour(data: HourlyData[], metric: string): string {
  const getValue = (item: HourlyData): number => {
    switch (metric) {
      case 'read_rate': return item.read_rate ?? 0;
      case 'delivery_rate': return item.delivery_rate ?? 0;
      case 'success_rate': return item.success_rate ?? 0;
      case 'interactions': return item.interactions ?? item.sent ?? 0;
      default: return 0;
    }
  };

  const peak = data.reduce((max, item) => getValue(item) > getValue(max) ? item : max, data[0]);
  const value = getValue(peak);
  
  return `${peak.hour.toString().padStart(2, '0')}h (${metric === 'interactions' ? value.toLocaleString() : value.toFixed(0) + '%'})`;
}

function findLowHour(data: HourlyData[], metric: string): string {
  const getValue = (item: HourlyData): number => {
    switch (metric) {
      case 'read_rate': return item.read_rate ?? 0;
      case 'delivery_rate': return item.delivery_rate ?? 0;
      case 'success_rate': return item.success_rate ?? 0;
      case 'interactions': return item.interactions ?? item.sent ?? 0;
      default: return 0;
    }
  };

  // Filtrar horas com alguma atividade para low hour
  const activeHours = data.filter(item => getValue(item) > 0);
  if (activeHours.length === 0) return '-';

  const low = activeHours.reduce((min, item) => getValue(item) < getValue(min) ? item : min, activeHours[0]);
  const value = getValue(low);
  
  return `${low.hour.toString().padStart(2, '0')}h (${metric === 'interactions' ? value.toLocaleString() : value.toFixed(0) + '%'})`;
}

export default HourlyHeatmap;
