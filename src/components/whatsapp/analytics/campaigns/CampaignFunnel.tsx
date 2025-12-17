'use client';

import { motion } from 'framer-motion';
import { formatNumber, FUNNEL_COLORS } from '@/types/whatsapp-analytics';

interface FunnelStage {
  stage: string;
  value: number;
  percent: number;
  color?: string;
}

interface CampaignFunnelProps {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  deliveryRate?: number;
  readRate?: number;
  replyRate?: number;
}

export function CampaignFunnel({
  sent,
  delivered,
  read,
  replied,
  deliveryRate,
  readRate,
  replyRate,
}: CampaignFunnelProps) {
  const stages: FunnelStage[] = [
    { 
      stage: 'Enviadas', 
      value: sent, 
      percent: 100,
      color: FUNNEL_COLORS[0],
    },
    { 
      stage: 'Entregues', 
      value: delivered, 
      percent: deliveryRate ?? (sent > 0 ? (delivered / sent) * 100 : 0),
      color: FUNNEL_COLORS[1],
    },
    { 
      stage: 'Lidas', 
      value: read, 
      percent: readRate ?? (delivered > 0 ? (read / delivered) * 100 : 0),
      color: FUNNEL_COLORS[2],
    },
    { 
      stage: 'Respondidas', 
      value: replied, 
      percent: replyRate ?? (sent > 0 ? (replied / sent) * 100 : 0),
      color: FUNNEL_COLORS[3],
    },
  ];

  const maxValue = sent || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6"
    >
      <h3 className="text-lg font-semibold text-white mb-6">Funil de Conversão</h3>

      <div className="space-y-4">
        {stages.map((stage, index) => {
          const widthPercent = (stage.value / maxValue) * 100;
          
          return (
            <div key={stage.stage} className="relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-300">{stage.stage}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">
                    {formatNumber(stage.value)}
                  </span>
                  {index > 0 && (
                    <span className="text-xs text-dark-400">
                      ({stage.percent.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
              
              <div className="h-10 bg-dark-700/50 rounded-lg overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPercent}%` }}
                  transition={{ duration: 0.8, delay: index * 0.1, ease: 'easeOut' }}
                  className="h-full rounded-lg flex items-center justify-end pr-3"
                  style={{ backgroundColor: stage.color }}
                >
                  {widthPercent > 15 && (
                    <span className="text-sm font-medium text-white/90">
                      {formatNumber(stage.value)}
                    </span>
                  )}
                </motion.div>
              </div>

              {/* Linha conectora */}
              {index < stages.length - 1 && (
                <div className="absolute left-1/2 -bottom-2 w-0.5 h-4 bg-dark-600" />
              )}
            </div>
          );
        })}
      </div>

      {/* Resumo de conversão */}
      <div className="mt-6 pt-4 border-t border-dark-700/50">
        <div className="grid grid-cols-3 gap-4 text-center">
          <ConversionMetric
            label="Entrega"
            value={deliveryRate ?? (sent > 0 ? (delivered / sent) * 100 : 0)}
            color="emerald"
          />
          <ConversionMetric
            label="Leitura"
            value={readRate ?? (delivered > 0 ? (read / delivered) * 100 : 0)}
            color="cyan"
          />
          <ConversionMetric
            label="Resposta"
            value={replyRate ?? (sent > 0 ? (replied / sent) * 100 : 0)}
            color="violet"
          />
        </div>
      </div>
    </motion.div>
  );
}

interface ConversionMetricProps {
  label: string;
  value: number;
  color: 'emerald' | 'cyan' | 'violet';
}

function ConversionMetric({ label, value, color }: ConversionMetricProps) {
  const colorClasses = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    violet: 'text-violet-400',
  };

  return (
    <div>
      <p className="text-xs text-dark-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorClasses[color]}`}>
        {value.toFixed(1)}%
      </p>
    </div>
  );
}

export default CampaignFunnel;
