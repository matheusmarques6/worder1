// =====================================================
// STORE ANALYZER - ANÁLISE DE LOJA COM IA
// src/lib/ai/store-analyzer.ts
//
// Analisa dados da loja e gera configurações de agente
// =====================================================

import type {
  CollectedStoreData,
  CollectedProduct,
  StoreAnalysis,
  StoreScores,
} from '@/types/store-analysis';

// =====================================================
// CLIENTE DE IA
// =====================================================

async function callAI(prompt: string): Promise<string> {
  // Tentar Anthropic primeiro
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.content[0].text;
      }
    } catch (err) {
      console.error('Anthropic error, falling back to OpenAI:', err);
    }
  }

  // Fallback para OpenAI
  if (process.env.OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  throw new Error('No AI provider configured');
}

// =====================================================
// ANÁLISE DE NICHO
// =====================================================

async function analyzeNiche(data: CollectedStoreData): Promise<{
  primaryNiche: string;
  secondaryNiche: string | null;
  templateId: string;
  confidence: number;
  targetGender: 'male' | 'female' | 'unisex';
  targetAgeRange: string;
  targetInterests: string[];
  buyingBehavior: string;
}> {
  // Preparar dados para análise
  const productTypes = getTopItems(data.products.items.map(p => p.productType).filter(Boolean), 10);
  const tags = getTopItems(data.products.items.flatMap(p => p.tags.split(',').map(t => t.trim())).filter(Boolean), 20);
  const priceRange = getPriceRange(data.products.items);
  const sampleProducts = data.products.items.slice(0, 20).map(p => ({
    title: p.title,
    type: p.productType,
    price: p.price,
  }));

  const prompt = `Analise esta loja e-commerce e identifique o nicho:

LOJA: ${data.shop.name}
TOTAL DE PRODUTOS: ${data.products.total}
CATEGORIAS: ${data.collections.map(c => c.title).join(', ')}
TIPOS DE PRODUTOS: ${productTypes.join(', ')}
TAGS: ${tags.join(', ')}
FAIXA DE PREÇO: R$ ${priceRange.min.toFixed(2)} - R$ ${priceRange.max.toFixed(2)}
AMOSTRA DE PRODUTOS:
${sampleProducts.map(p => `- ${p.title} (${p.type}) - R$ ${p.price}`).join('\n')}

Responda APENAS em JSON com este formato exato:
{
  "primaryNiche": "nome do nicho principal em português",
  "secondaryNiche": "nicho secundário ou null",
  "templateId": "id do template (moda-feminina|pet-shop|fitness|beleza|delivery|casa|baby|joias|custom)",
  "confidence": 85,
  "targetGender": "female|male|unisex",
  "targetAgeRange": "faixa etária ex: 25-45",
  "targetInterests": ["interesse1", "interesse2", "interesse3"],
  "buyingBehavior": "descrição breve do comportamento de compra"
}`;

  const response = await callAI(prompt);
  return extractJSON(response);
}

// =====================================================
// ANÁLISE DE BRANDING
// =====================================================

async function analyzeBranding(data: CollectedStoreData): Promise<{
  tone: 'casual' | 'friendly' | 'professional' | 'luxury';
  personality: string[];
  voiceDescription: string;
  emojis: string[];
  suggestedDescription: string;
}> {
  const descriptions = data.products.items
    .filter(p => p.description)
    .slice(0, 10)
    .map(p => stripHtml(p.description || '').substring(0, 200));

  const tags = getTopItems(
    data.products.items.flatMap(p => p.tags.split(',').map(t => t.trim())).filter(Boolean),
    30
  );

  const prompt = `Analise o branding desta loja:

NOME: ${data.shop.name}
DESCRIÇÃO DA LOJA: ${data.shop.description || 'Não informada'}

AMOSTRA DE DESCRIÇÕES DE PRODUTOS:
${descriptions.join('\n---\n')}

TAGS USADAS: ${tags.join(', ')}

Responda APENAS em JSON com este formato:
{
  "tone": "casual|friendly|professional|luxury",
  "personality": ["adjetivo1", "adjetivo2", "adjetivo3"],
  "voiceDescription": "descrição do tom de voz ideal para esta marca",
  "emojis": ["emoji1", "emoji2", "emoji3", "emoji4", "emoji5"],
  "suggestedDescription": "descrição sugerida para o agente"
}`;

  const response = await callAI(prompt);
  return extractJSON(response);
}

// =====================================================
// GERAÇÃO DE FAQ
// =====================================================

async function generateFAQ(data: CollectedStoreData, niche: string): Promise<{
  question: string;
  answer: string;
  category: string;
}[]> {
  const priceRange = getPriceRange(data.products.items);
  
  const prompt = `Gere FAQ para esta loja de ${niche}:

LOJA: ${data.shop.name}
PRODUTOS: ${data.products.total}
CATEGORIAS: ${data.collections.map(c => c.title).slice(0, 10).join(', ')}
FAIXA DE PREÇO: R$ ${priceRange.min.toFixed(2)} - R$ ${priceRange.max.toFixed(2)}
POLÍTICA DE DEVOLUÇÃO: ${data.policies.refund?.substring(0, 300) || 'Não informada'}
POLÍTICA DE FRETE: ${data.policies.shipping?.substring(0, 300) || 'Não informada'}

Gere 8-12 perguntas frequentes relevantes para este tipo de loja.
Responda APENAS em JSON com este formato:
{
  "items": [
    {"question": "pergunta", "answer": "resposta curta e útil", "category": "shipping|returns|payment|product|general"}
  ]
}`;

  const response = await callAI(prompt);
  const result = extractJSON(response);
  return result.items || [];
}

// =====================================================
// GERAÇÃO DE INSIGHTS
// =====================================================

async function generateInsights(data: CollectedStoreData, scores: StoreScores): Promise<{
  type: 'success' | 'warning' | 'error' | 'tip';
  title: string;
  description: string;
  action: string;
}[]> {
  const stats = {
    total: data.products.total,
    withDescription: data.products.items.filter(p => p.description && p.description.length > 50).length,
    withImages: data.products.items.filter(p => p.images > 0).length,
    outOfStock: data.products.items.filter(p => p.inventory === 0).length,
    lowStock: data.products.items.filter(p => p.inventory > 0 && p.inventory < 5).length,
    hasPolicies: !!(data.policies.refund || data.policies.shipping),
  };

  const prompt = `Analise estes dados da loja e gere insights:

ESTATÍSTICAS:
- Total de produtos: ${stats.total}
- Com descrição: ${stats.withDescription} (${Math.round(stats.withDescription/stats.total*100)}%)
- Com imagens: ${stats.withImages} (${Math.round(stats.withImages/stats.total*100)}%)
- Sem estoque: ${stats.outOfStock}
- Estoque baixo: ${stats.lowStock}
- Tem políticas: ${stats.hasPolicies ? 'Sim' : 'Não'}

SCORES:
- Geral: ${scores.overall}/100
- Produtos: ${scores.products}/100
- Descrições: ${scores.descriptions}/100
- Políticas: ${scores.policies}/100
- Imagens: ${scores.images}/100

Gere 4-6 insights acionáveis.
Responda APENAS em JSON:
{
  "items": [
    {"type": "success|warning|error|tip", "title": "título", "description": "descrição", "action": "ação sugerida"}
  ]
}`;

  const response = await callAI(prompt);
  const result = extractJSON(response);
  return result.items || [];
}

// =====================================================
// CÁLCULO DE SCORES
// =====================================================

function calculateStoreScores(data: CollectedStoreData): StoreScores {
  const products = data.products.items;
  const total = products.length || 1;

  // Score de produtos (quantidade + estoque + variedade)
  const inStockRatio = products.filter(p => p.inventory > 0).length / total;
  const productScore = Math.min(100, 
    (data.products.total * 0.3) + // até 30 pontos por quantidade
    (inStockRatio * 30) + // até 30 pontos por estoque
    (data.collections.length * 8) // até 40 pontos por variedade
  );

  // Score de descrições
  const withDesc = products.filter(p => p.description && p.description.length > 50).length;
  const descRatio = withDesc / total;
  const avgDescLength = products.reduce((sum, p) => sum + (p.description?.length || 0), 0) / total;
  const descScore = Math.min(100,
    (descRatio * 60) + // até 60 pontos por presença
    (Math.min(avgDescLength / 500, 1) * 40) // até 40 pontos por tamanho
  );

  // Score de políticas
  let policyScore = 0;
  if (data.policies.refund) policyScore += 35;
  if (data.policies.shipping) policyScore += 35;
  if (data.policies.privacy) policyScore += 15;
  if (data.policies.terms) policyScore += 15;

  // Score de imagens
  const withImages = products.filter(p => p.images > 0).length;
  const imageRatio = withImages / total;
  const avgImages = products.reduce((sum, p) => sum + p.images, 0) / total;
  const imageScore = Math.min(100,
    (imageRatio * 50) + // até 50 pontos por presença
    (Math.min(avgImages / 5, 1) * 50) // até 50 pontos por quantidade média
  );

  // Score geral (média ponderada)
  const overall = Math.round(
    productScore * 0.30 +
    descScore * 0.25 +
    policyScore * 0.25 +
    imageScore * 0.20
  );

  return {
    overall,
    products: Math.round(productScore),
    descriptions: Math.round(descScore),
    policies: Math.round(policyScore),
    images: Math.round(imageScore),
  };
}

// =====================================================
// GERAÇÃO DE PROMPT
// =====================================================

function generateAgentPrompt(
  data: CollectedStoreData,
  niche: { primaryNiche: string; targetGender: string; targetAgeRange: string },
  branding: { tone: string; personality: string[]; emojis: string[]; voiceDescription: string }
): { prompt: string; guidelines: string[]; greeting: string } {
  const priceRange = getPriceRange(data.products.items);
  
  const prompt = `## IDENTIDADE
Você é o assistente virtual da **${data.shop.name}** ${branding.emojis[0] || '😊'}
${branding.voiceDescription}

## SOBRE A LOJA
- **Nicho:** ${niche.primaryNiche}
- **Público:** ${niche.targetGender === 'female' ? 'Mulheres' : niche.targetGender === 'male' ? 'Homens' : 'Todos'} de ${niche.targetAgeRange} anos
- **Catálogo:** ${data.products.total} produtos em ${data.collections.length} categorias
- **Faixa de preço:** R$ ${priceRange.min.toFixed(2)} - R$ ${priceRange.max.toFixed(2)}

## TOM DE VOZ
${branding.voiceDescription}
Personalidade: ${branding.personality.join(', ')}
Emojis sugeridos: ${branding.emojis.join(' ')}

## SEU PAPEL
- Ajudar clientes a encontrar produtos ideais
- Responder dúvidas sobre produtos, preços e disponibilidade
- Informar sobre políticas de entrega e troca
- Criar conexão genuína com os clientes
- Sugerir produtos complementares quando apropriado

## POLÍTICAS
${data.policies.shipping ? `**Entrega:** ${data.policies.shipping.substring(0, 300)}` : ''}
${data.policies.refund ? `**Trocas:** ${data.policies.refund.substring(0, 300)}` : ''}

## LIMITAÇÕES
- Não invente produtos que não existem
- Não prometa descontos além dos permitidos
- Se não souber algo, diga que vai verificar
- Transfira para humano em casos complexos`;

  const guidelines = [
    'Cumprimente de forma apropriada ao tom da marca',
    `Use emojis com moderação: ${branding.emojis.slice(0, 5).join(' ')}`,
    'Responda de forma concisa mas completa',
    'Pergunte sobre as necessidades do cliente antes de recomendar',
    'Destaque benefícios, não apenas características',
  ];

  const greetings: Record<string, string> = {
    friendly: `Oi! ${branding.emojis[0] || '😊'} Bem-vindo(a) à ${data.shop.name}! Como posso te ajudar hoje?`,
    casual: `E aí! ${branding.emojis[0] || '👋'} Tudo bem? Aqui é da ${data.shop.name}! O que você precisa?`,
    professional: `Olá! Seja bem-vindo(a) à ${data.shop.name}. Como posso ajudá-lo(a)?`,
    luxury: `É um prazer recebê-lo(a) na ${data.shop.name}. Em que posso ser útil?`,
  };

  return {
    prompt,
    guidelines,
    greeting: greetings[branding.tone] || greetings.friendly,
  };
}

// =====================================================
// FUNÇÃO PRINCIPAL
// =====================================================

export async function runFullAnalysis(
  data: CollectedStoreData,
  onProgress?: (step: number, total: number, message: string) => void
): Promise<StoreAnalysis> {
  const totalSteps = 7;
  const progress = (step: number, message: string) => {
    onProgress?.(step, totalSteps, message);
  };

  // Step 1: Calcular scores
  progress(1, 'Calculando scores da loja...');
  const scores = calculateStoreScores(data);

  // Step 2: Analisar nicho
  progress(2, 'Analisando nicho e público-alvo...');
  const nicheAnalysis = await analyzeNiche(data);

  // Step 3: Analisar branding
  progress(3, 'Analisando branding e tom de voz...');
  const brandingAnalysis = await analyzeBranding(data);

  // Step 4: Gerar FAQ
  progress(4, 'Gerando perguntas frequentes...');
  const faq = await generateFAQ(data, nicheAnalysis.primaryNiche);

  // Step 5: Gerar insights
  progress(5, 'Gerando insights e recomendações...');
  const insights = await generateInsights(data, scores);

  // Step 6: Gerar prompt
  progress(6, 'Gerando prompt do agente...');
  const { prompt, guidelines, greeting } = generateAgentPrompt(data, nicheAnalysis, brandingAnalysis);

  // Step 7: Montar resultado
  progress(7, 'Finalizando análise...');
  
  const priceRange = getPriceRange(data.products.items);
  const products = data.products.items;

  const analysis: StoreAnalysis = {
    // Identificação
    storeName: data.shop.name,
    storeDescription: data.shop.description || brandingAnalysis.suggestedDescription,
    storeDomain: data.shop.domain,

    // Nicho
    detectedNiche: nicheAnalysis.primaryNiche,
    nicheConfidence: nicheAnalysis.confidence,
    suggestedTemplate: nicheAnalysis.templateId,

    // Público-alvo
    targetAudience: {
      gender: nicheAnalysis.targetGender,
      ageRange: nicheAnalysis.targetAgeRange,
      interests: nicheAnalysis.targetInterests,
      buyingBehavior: nicheAnalysis.buyingBehavior,
    },

    // Produtos
    products: {
      total: data.products.total,
      inStock: products.filter(p => p.inventory > 0).length,
      lowStock: products.filter(p => p.inventory > 0 && p.inventory < 5).length,
      outOfStock: products.filter(p => p.inventory === 0).length,
      withImages: products.filter(p => p.images > 0).length,
      withDescription: products.filter(p => p.description && p.description.length > 50).length,
    },

    // Categorias
    categories: data.collections.slice(0, 10).map(c => ({
      name: c.title,
      count: c.productsCount || 0,
    })),

    // Preços
    priceRange: {
      min: priceRange.min,
      max: priceRange.max,
      average: priceRange.avg,
      currency: data.shop.currency || 'BRL',
    },

    // Top produtos
    topProducts: products
      .sort((a, b) => b.inventory - a.inventory)
      .slice(0, 10)
      .map(p => ({
        name: p.title,
        price: p.price,
        category: p.productType,
        inventory: p.inventory,
        inventoryStatus: p.inventory === 0 ? 'out' as const : p.inventory < 5 ? 'low' as const : 'ok' as const,
      })),

    // Branding
    branding: {
      detectedColors: [],
      tone: brandingAnalysis.tone,
      personality: brandingAnalysis.personality,
      suggestedEmojis: brandingAnalysis.emojis,
      voiceDescription: brandingAnalysis.voiceDescription,
    },

    // Políticas
    policies: {
      shipping: data.policies.shipping?.substring(0, 500) || null,
      returns: data.policies.refund?.substring(0, 500) || null,
      payments: ['Pix', 'Cartão de Crédito', 'Boleto'],
    },

    // Scores
    scores,

    // Insights
    insights: insights.map(i => ({
      type: i.type,
      title: i.title,
      description: i.description,
      action: i.action,
    })),

    // Prompt gerado
    generatedPrompt: prompt,
    generatedGuidelines: guidelines,
    suggestedGreeting: greeting,

    // FAQ
    suggestedFAQ: faq,

    // Metadata
    analyzedAt: new Date().toISOString(),
    confidence: nicheAnalysis.confidence,
  };

  return analysis;
}

// =====================================================
// HELPERS
// =====================================================

function getTopItems(items: string[], limit: number): string[] {
  const counts = items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

function getPriceRange(products: CollectedProduct[]): { min: number; max: number; avg: number } {
  const prices = products.map(p => p.price).filter(p => p > 0);
  if (prices.length === 0) return { min: 0, max: 0, avg: 0 };
  
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJSON(text: string): any {
  try {
    // Tentar parse direto
    return JSON.parse(text);
  } catch {
    // Tentar extrair JSON do texto
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        console.error('Failed to parse extracted JSON');
      }
    }
  }
  return {};
}

export default runFullAnalysis;
