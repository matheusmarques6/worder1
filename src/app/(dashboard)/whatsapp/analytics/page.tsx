'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Megaphone,
  Bot,
  MessageCircle,
  RefreshCw,
  Download,
  Calendar,
  ChevronDown,
} from 'lucide-react';

// Hooks
import { useWhatsAppAnalytics } from '@/hooks/useWhatsAppAnalytics';
import { useWhatsAppAIAnalytics } from '@/hooks/useWhatsAppAIAnalytics';

// Campaign Components
import {
  CampaignKPICards,
  CampaignRateCards,
  CampaignPerformanceChart,
  CampaignFunnel,
  CampaignTable,
  CampaignErrorBreakdown,
} from '@/components/whatsapp/analytics/campaigns';

// AI Components
import {
  AIKPICards,
  AIAgentsGrid,
  AIPerformanceChart,
  AITokensChart,
  AILatencyChart,
  AIProviderBreakdown,
  AIQualityMetrics,
} from '@/components/whatsapp/analytics/ai';

// Shared Components
import { HourlyHeatmap } from '@/components/whatsapp/analytics/shared';

// Types
import type { DateRange } from '@/types/whatsapp-analytics';

type Tab = 'campaigns' | 'ai' | 'conversations';

const periods: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 Dias' },
  { value: '30d', label: '30 Dias' },
  { value: '90d', label: '90 Dias' },
  { value: 'all', label: 'Todo Período' },
];

export default function WhatsAppAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('campaigns');
  const [period, setPeriod] = useState<DateRange>('7d');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  
  // TODO: Substituir por org real do contexto
  const organizationId = 'org-placeholder';

  // Hooks de analytics
  const {
    data: campaignData,
    isLoading: campaignLoading,
    fetchAnalytics: fetchCampaignAnalytics,
  } = useWhatsAppAnalytics();

  const {
    data: aiData,
    isLoading: aiLoading,
    fetchAnalytics: fetchAIAnalytics,
  } = useWhatsAppAIAnalytics();

  // Fetch data on mount and period change
  useEffect(() => {
    if (organizationId && organizationId !== 'org-placeholder') {
      if (activeTab === 'campaigns') {
        fetchCampaignAnalytics({ organizationId, period });
      } else if (activeTab === 'ai') {
        fetchAIAnalytics({ organizationId, period });
      }
    }
  }, [organizationId, period, activeTab]);

  const handleRefresh = () => {
    if (organizationId !== 'org-placeholder') {
      if (activeTab === 'campaigns') {
        fetchCampaignAnalytics({ organizationId, period });
      } else if (activeTab === 'ai') {
        fetchAIAnalytics({ organizationId, period });
      }
    }
  };

  const isLoading = activeTab === 'campaigns' ? campaignLoading : aiLoading;

  return (
    <div className="min-h-screen bg-dark-900 p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Analytics WhatsApp</h1>
              <p className="text-dark-400 text-sm">
                Métricas e performance das suas campanhas e agentes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white hover:border-dark-600 transition-colors"
              >
                <Calendar className="w-4 h-4 text-dark-400" />
                <span>{periods.find(p => p.value === period)?.label}</span>
                <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {showPeriodDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-40 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 overflow-hidden"
                  >
                    {periods.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setPeriod(p.value);
                          setShowPeriodDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-dark-700 transition-colors ${
                          period === p.value ? 'text-primary-400 bg-dark-700/50' : 'text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Export Button */}
            <button className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white hover:border-dark-600 transition-colors">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white hover:border-dark-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 bg-dark-800/50 p-1 rounded-xl w-fit">
          <TabButton
            active={activeTab === 'campaigns'}
            onClick={() => setActiveTab('campaigns')}
            icon={Megaphone}
            label="Campanhas"
          />
          <TabButton
            active={activeTab === 'ai'}
            onClick={() => setActiveTab('ai')}
            icon={Bot}
            label="Agentes IA"
          />
          <TabButton
            active={activeTab === 'conversations'}
            onClick={() => setActiveTab('conversations')}
            icon={MessageCircle}
            label="Conversas"
            disabled
            badge="Em breve"
          />
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'campaigns' && (
            <CampaignsTab
              key="campaigns"
              data={campaignData}
              isLoading={campaignLoading}
            />
          )}
          {activeTab === 'ai' && (
            <AIAgentsTab
              key="ai"
              data={aiData}
              isLoading={aiLoading}
            />
          )}
          {activeTab === 'conversations' && (
            <ConversationsTab key="conversations" />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  badge?: string;
}

function TabButton({ active, onClick, icon: Icon, label, disabled, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
        active
          ? 'bg-dark-700 text-white'
          : disabled
            ? 'text-dark-500 cursor-not-allowed'
            : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {badge && (
        <span className="px-1.5 py-0.5 text-xs bg-dark-600 text-dark-400 rounded">
          {badge}
        </span>
      )}
    </button>
  );
}

// ===========================================
// CAMPAIGNS TAB
// ===========================================

interface CampaignsTabProps {
  data: any;
  isLoading: boolean;
}

function CampaignsTab({ data, isLoading }: CampaignsTabProps) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (!data) {
    return <EmptyState message="Selecione uma organização para ver os analytics" />;
  }

  const { summary, trends, chart_data, campaigns, error_breakdown, hourly_distribution, best_hours } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* KPIs */}
      <CampaignKPICards
        sent={summary.total_sent}
        delivered={summary.total_delivered}
        read={summary.total_read}
        replied={summary.total_replied}
        failed={summary.total_failed}
        sentChange={trends.sent_change}
        deliveredChange={trends.delivered_change}
        readChange={trends.read_change}
        repliedChange={trends.replied_change}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CampaignPerformanceChart data={chart_data} />
        </div>
        <div>
          <CampaignFunnel
            sent={summary.total_sent}
            delivered={summary.total_delivered}
            read={summary.total_read}
            replied={summary.total_replied}
            deliveryRate={summary.delivery_rate}
            readRate={summary.read_rate}
            replyRate={summary.reply_rate}
          />
        </div>
      </div>

      {/* Campaign Table */}
      <CampaignTable
        campaigns={campaigns}
        onViewDetails={(id) => console.log('View campaign:', id)}
      />

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CampaignErrorBreakdown errors={error_breakdown} />
        <HourlyHeatmap
          data={hourly_distribution}
          metric="read_rate"
          title="Taxa de Leitura por Hora"
          bestHour={best_hours?.read}
        />
      </div>
    </motion.div>
  );
}

// ===========================================
// AI AGENTS TAB
// ===========================================

interface AIAgentsTabProps {
  data: any;
  isLoading: boolean;
}

function AIAgentsTab({ data, isLoading }: AIAgentsTabProps) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (!data) {
    return <EmptyState message="Selecione uma organização para ver os analytics de IA" />;
  }

  const { summary, trends, agents, chart_data, by_provider, hourly_distribution, performance, quality, error_breakdown } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* KPIs */}
      <AIKPICards
        interactions={summary.total_interactions}
        tokens={summary.total_tokens}
        costUsd={summary.estimated_cost_usd}
        avgLatencyMs={summary.avg_response_time_ms}
        successRate={summary.success_rate}
        resolutionRate={summary.resolution_rate}
        interactionsChange={trends.interactions_change}
        tokensChange={trends.tokens_change}
        costChange={trends.cost_change}
        latencyChange={trends.latency_change}
        successRateChange={trends.success_rate_change}
        resolutionRateChange={trends.resolution_rate_change}
      />

      {/* Agents Grid */}
      <AIAgentsGrid
        agents={agents}
        onAgentClick={(id) => console.log('View agent:', id)}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AIPerformanceChart data={chart_data} />
        <AITokensChart data={chart_data} />
      </div>

      {/* Latency & Quality Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AILatencyChart
          p50={performance.p50_latency_ms}
          p95={performance.p95_latency_ms}
          p99={performance.p99_latency_ms}
          avg={performance.avg_latency_ms}
        />
        <AIProviderBreakdown data={by_provider} />
        <AIQualityMetrics metrics={quality} />
      </div>

      {/* Hourly Heatmap */}
      <HourlyHeatmap
        data={hourly_distribution}
        metric="interactions"
        title="Interações por Hora"
      />
    </motion.div>
  );
}

// ===========================================
// CONVERSATIONS TAB (Coming Soon)
// ===========================================

function ConversationsTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <MessageCircle className="w-16 h-16 text-dark-600 mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">Em desenvolvimento</h2>
      <p className="text-dark-400 text-center max-w-md">
        Analytics de conversas estará disponível em breve.
        Você poderá ver métricas como tempo de resposta, satisfação e volume de conversas.
      </p>
    </motion.div>
  );
}

// ===========================================
// SHARED COMPONENTS
// ===========================================

function LoadingState() {
  return (
    <div className="space-y-6">
      {/* KPIs skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-5 animate-pulse">
            <div className="w-10 h-10 bg-dark-700 rounded-lg mb-4" />
            <div className="h-8 bg-dark-700 rounded w-20 mb-2" />
            <div className="h-4 bg-dark-700 rounded w-16" />
          </div>
        ))}
      </div>
      
      {/* Chart skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-dark-800/50 rounded-xl border border-dark-700/50 p-6 h-[400px] animate-pulse">
          <div className="h-6 bg-dark-700 rounded w-48 mb-4" />
          <div className="h-full bg-dark-700/50 rounded" />
        </div>
        <div className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6 animate-pulse">
          <div className="h-6 bg-dark-700 rounded w-40 mb-4" />
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-dark-700/50 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <BarChart3 className="w-16 h-16 text-dark-600 mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">Sem dados</h2>
      <p className="text-dark-400 text-center max-w-md">{message}</p>
    </div>
  );
}
