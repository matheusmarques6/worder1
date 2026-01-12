// =============================================
// Store Analysis Types
// src/types/store-analysis.ts
// =============================================

// =============================================
// Dados Coletados do Shopify
// =============================================

export interface CollectedStoreData {
  shop: {
    name: string;
    domain: string;
    email: string;
    currency: string;
    country: string;
    description: string | null;
    createdAt: string;
  };
  products: {
    total: number;
    items: CollectedProduct[];
  };
  collections: CollectedCollection[];
  policies: {
    refund: string | null;
    shipping: string | null;
    privacy: string | null;
    terms: string | null;
  };
  shipping: any[];
  payments: any;
}

export interface CollectedProduct {
  id: string;
  title: string;
  description: string | null;
  vendor: string;
  productType: string;
  tags: string;
  price: number;
  compareAtPrice: number;
  inventory: number;
  images: number;
  variants: number;
  createdAt: string;
}

export interface CollectedCollection {
  id: string;
  title: string;
  productsCount: number;
}

// =============================================
// Resultado da Análise com IA
// =============================================

export interface NicheAnalysis {
  primaryNiche: string;
  secondaryNiche: string | null;
  templateId: string;
  confidence: number;
  targetGender: 'male' | 'female' | 'unisex';
  targetAgeRange: string;
  targetInterests: string[];
  buyingBehavior: string;
  reasoning: string;
}

export interface BrandingAnalysis {
  tone: 'casual' | 'friendly' | 'professional' | 'luxury';
  personality: string[];
  voiceDescription: string;
  emojis: string[];
  colors: {
    hex: string;
    name: string;
    usage: 'primary' | 'secondary' | 'accent';
  }[];
  suggestedDescription: string;
  confidence: number;
}

export interface FAQAnalysis {
  items: {
    question: string;
    answer: string;
    category: 'shipping' | 'returns' | 'payment' | 'product' | 'general';
    priority: 'high' | 'medium' | 'low';
  }[];
}

export interface InsightsAnalysis {
  items: {
    type: 'success' | 'warning' | 'error' | 'tip';
    title: string;
    description: string;
    suggestedAction: string;
    impact: 'high' | 'medium' | 'low';
  }[];
}

// =============================================
// Scores da Loja
// =============================================

export interface StoreScores {
  overall: number;
  products: number;
  descriptions: number;
  policies: number;
  images: number;
}

// =============================================
// Resultado Final da Análise
// =============================================

export interface StoreAnalysis {
  // Identificação
  storeName: string;
  storeDescription: string;
  storeDomain: string;
  
  // Nicho detectado
  detectedNiche: string;
  nicheConfidence: number;
  suggestedTemplate: string;
  
  // Público-alvo
  targetAudience: {
    gender: 'male' | 'female' | 'unisex';
    ageRange: string;
    interests: string[];
    buyingBehavior: string;
  };
  
  // Produtos
  products: {
    total: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    withImages: number;
    withDescription: number;
  };
  
  // Categorias
  categories: {
    name: string;
    count: number;
  }[];
  
  // Faixa de preço
  priceRange: {
    min: number;
    max: number;
    average: number;
    currency: string;
  };
  
  // Top produtos
  topProducts: {
    name: string;
    price: number;
    category: string;
    inventory: number;
    inventoryStatus: 'ok' | 'low' | 'out';
  }[];
  
  // Branding
  branding: {
    detectedColors: {
      hex: string;
      name: string;
      usage: 'primary' | 'secondary' | 'accent';
    }[];
    tone: 'casual' | 'friendly' | 'professional' | 'luxury';
    personality: string[];
    suggestedEmojis: string[];
    voiceDescription: string;
  };
  
  // Políticas
  policies: {
    shipping: string | null;
    returns: string | null;
    payments: string[];
  };
  
  // Scores
  scores: StoreScores;
  
  // Insights
  insights: {
    type: 'success' | 'warning' | 'error' | 'tip';
    title: string;
    description: string;
    action: string;
  }[];
  
  // Prompt gerado
  generatedPrompt: string;
  generatedGuidelines: string[];
  suggestedGreeting: string;
  
  // FAQ sugerido
  suggestedFAQ: {
    question: string;
    answer: string;
    category: string;
  }[];
  
  // Metadata
  analyzedAt: string;
  confidence: number;
}

// =============================================
// Request/Response da API
// =============================================

export interface AnalyzeStoreRequest {
  storeId: string;
}

export interface AnalyzeStoreProgress {
  type: 'progress';
  step: number;
  totalSteps: number;
  message: string;
}

export interface AnalyzeStoreComplete {
  type: 'complete';
  analysis: StoreAnalysis;
}

export interface AnalyzeStoreError {
  type: 'error';
  message: string;
}

export type AnalyzeStoreEvent = 
  | AnalyzeStoreProgress 
  | AnalyzeStoreComplete 
  | AnalyzeStoreError;
