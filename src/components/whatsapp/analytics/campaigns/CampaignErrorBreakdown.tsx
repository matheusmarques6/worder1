'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Info } from 'lucide-react';
import { WHATSAPP_ERROR_CODES } from '@/types/whatsapp-analytics';
import type { ErrorBreakdown } from '@/types/whatsapp-analytics';

interface CampaignErrorBreakdownProps {
  errors: ErrorBreakdown;
  maxItems?: number;
}

export function CampaignErrorBreakdown({ errors, maxItems = 5 }: CampaignErrorBreakdownProps) {
  const errorEntries = Object.entries(errors)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, maxItems);

  const totalErrors = Object.values(errors).reduce((sum, e) => sum + e.count, 0);

  if (errorEntries.length === 0 || totalErrors === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Erros</h3>
        </div>
        
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-dark-300">Nenhum erro registrado</p>
          <p className="text-sm text-dark-400 mt-1">Todas as mensagens foram processadas com sucesso</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Erros por Código</h3>
        </div>
        <span className="text-sm text-dark-400">
          Total: {totalErrors.toLocaleString()}
        </span>
      </div>

      <div className="space-y-3">
        {errorEntries.map(([code, data], index) => {
          const description = WHATSAPP_ERROR_CODES[code] || data.description || 'Erro desconhecido';
          const percent = data.percent ?? (totalErrors > 0 ? (data.count / totalErrors) * 100 : 0);

          return (
            <ErrorBar
              key={code}
              code={code}
              description={description}
              count={data.count}
              percent={percent}
              delay={index * 0.05}
            />
          );
        })}
      </div>

      {Object.keys(errors).length > maxItems && (
        <p className="text-sm text-dark-400 mt-4 text-center">
          +{Object.keys(errors).length - maxItems} outros tipos de erro
        </p>
      )}
    </motion.div>
  );
}

interface ErrorBarProps {
  code: string;
  description: string;
  count: number;
  percent: number;
  delay?: number;
}

function ErrorBar({ code, description, count, percent, delay = 0 }: ErrorBarProps) {
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
            {code}
          </code>
          <span className="text-sm text-dark-300 truncate max-w-[200px]" title={description}>
            {description}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">
            {count.toLocaleString()}
          </span>
          <span className="text-xs text-dark-400 w-12 text-right">
            {percent.toFixed(1)}%
          </span>
        </div>
      </div>
      
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percent, 100)}%` }}
          transition={{ duration: 0.6, delay, ease: 'easeOut' }}
          className="h-full bg-red-500/60 rounded-full"
        />
      </div>
    </div>
  );
}

export default CampaignErrorBreakdown;
