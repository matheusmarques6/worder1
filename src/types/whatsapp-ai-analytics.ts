// ===============================
// WHATSAPP AI ANALYTICS TYPES
// ===============================

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface AIAnalyticsOverview {
  totalConversations: number;
  aiHandledConversations: number;
  humanHandledConversations: number;
  aiHandleRate: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  customerSatisfactionScore: number;
  totalMessages: number;
  aiMessages: number;
  humanMessages: number;
}

export interface AIPerformanceMetrics {
  accuracy: number;
  accuracyChange: number;
  responseTime: number;
  responseTimeChange: number;
  resolutionRate: number;
  resolutionRateChange: number;
  escalationRate: number;
  escalationRateChange: number;
  satisfactionScore: number;
  satisfactionChange: number;
}

export interface ConversationMetrics {
  date: string;
  totalConversations: number;
  aiHandled: number;
  humanHandled: number;
  escalated: number;
  resolved: number;
}

export interface ResponseTimeMetrics {
  date: string;
  aiResponseTime: number;
  humanResponseTime: number;
  averageResponseTime: number;
}

export interface SatisfactionMetrics {
  date: string;
  score: number;
  responses: number;
  positive: number;
  neutral: number;
  negative: number;
}

export interface TopIntent {
  intent: string;
  count: number;
  percentage: number;
  aiResolutionRate: number;
  avgResponseTime: number;
}

export interface EscalationReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface QualityMetrics {
  totalResponses: number;
  accurateResponses: number;
  inaccurateResponses: number;
  accuracy: number;
  falsePositives: number;
  falseNegatives: number;
  confidenceScore: number;
}

export interface AIErrorBreakdown {
  category: string;
  count: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
}

export interface HourlyMetrics {
  hour: number;
  conversations: number;
  aiHandled: number;
  responseTime: number;
}

export interface DailyMetrics {
  dayOfWeek: number;
  dayName: string;
  conversations: number;
  aiHandled: number;
  responseTime: number;
}

export interface AIModelMetrics {
  modelVersion: string;
  deployedAt: string;
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}

export interface ConversationSummary {
  id: string;
  contactName: string;
  contactPhone: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'resolved' | 'escalated';
  handledBy: 'ai' | 'human' | 'mixed';
  messagesCount: number;
  satisfactionScore?: number;
  primaryIntent?: string;
  resolutionTime?: number;
}

export interface AIAnalyticsFilters {
  dateRange: DateRange;
  handledBy?: 'all' | 'ai' | 'human';
  status?: 'all' | 'resolved' | 'escalated' | 'active';
  intent?: string;
  satisfactionMin?: number;
  satisfactionMax?: number;
}

export interface AIAnalyticsDashboard {
  overview: AIAnalyticsOverview;
  performance: AIPerformanceMetrics;
  conversationTrends: ConversationMetrics[];
  responseTimeTrends: ResponseTimeMetrics[];
  satisfactionTrends: SatisfactionMetrics[];
  topIntents: TopIntent[];
  escalationReasons: EscalationReason[];
  qualityMetrics: QualityMetrics;
  errorBreakdown: AIErrorBreakdown[];
  hourlyPatterns: HourlyMetrics[];
  dailyPatterns: DailyMetrics[];
  modelMetrics: AIModelMetrics;
  recentConversations: ConversationSummary[];
}

// API Response Types
export interface AIAnalyticsResponse {
  success: boolean;
  data?: AIAnalyticsDashboard;
  error?: string;
  message?: string;
}

export interface AIMetricsResponse {
  success: boolean;
  data?: AIPerformanceMetrics;
  error?: string;
}

export interface ConversationsResponse {
  success: boolean;
  data?: ConversationSummary[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}
