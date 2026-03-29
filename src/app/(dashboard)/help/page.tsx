'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  Search,
  Book,
  Video,
  MessageCircle,
  Mail,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Zap,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  Workflow,
  MessageSquare,
  CreditCard,
  Shield,
  ArrowRight,
  Phone,
  Clock,
  CheckCircle,
  Loader2,
  Plug,
  Rocket,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

// Icon map for dynamic icons
const iconMap: Record<string, any> = {
  Rocket,
  Users,
  MessageCircle,
  Mail,
  Zap,
  Plug,
  BarChart3,
  Settings,
  Workflow,
  MessageSquare,
  CreditCard,
  Shield,
  ShoppingCart,
  Book,
  HelpCircle,
};

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  is_featured: boolean;
  category?: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    color: string;
  };
}

interface HelpCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  faqs: FAQItem[];
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<HelpCategory[]>([]);
  const [featuredFaqs, setFeaturedFaqs] = useState<FAQItem[]>([]);
  const [allFaqs, setAllFaqs] = useState<FAQItem[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/help');
      const data = await res.json();

      if (data.error) {
        console.error('Error:', data.error);
        return;
      }

      setCategories(data.faqsByCategory || []);
      setFeaturedFaqs(data.featuredFaqs || []);
      setAllFaqs(data.allFaqs || []);

    } catch (error) {
      console.error('Error fetching help data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFeedback = async (faqId: string, helpful: boolean) => {
    try {
      await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'faq', id: faqId, helpful }),
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  // Filter FAQs based on search and category
  const filteredFaqs = allFaqs.filter(faq => {
    const matchesSearch = !searchQuery ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = !activeCategory || faq.category?.slug === activeCategory;

    return matchesSearch && matchesCategory;
  });

  // Group filtered FAQs by category
  const groupedFaqs = categories.map(cat => ({
    ...cat,
    faqs: filteredFaqs.filter(f => f.category?.slug === cat.slug),
  })).filter(cat => cat.faqs.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <p className="text-gray-500">Carregando central de ajuda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600/20 via-dark-800 to-accent-600/20 p-8 md:p-12">
        <div className="absolute inset-0 bg-grid-white/5" />
        <div className="relative">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-2xl bg-brand-100 backdrop-blur-sm">
              <HelpCircle className="w-8 h-8 text-brand-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Central de Ajuda</h1>
              <p className="text-gray-600">Encontre respostas e aprenda a usar a plataforma</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Pesquise por perguntas, artigos ou tutoriais..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-xl bg-white backdrop-blur-sm border border-gray-200 text-white placeholder-dark-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          {/* Quick Links */}
          <div className="flex flex-wrap gap-3 mt-6">
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              Falar com Suporte
            </a>
            <a
              href="mailto:suporte@worder.com"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
            >
              <Mail className="w-4 h-4" />
              Enviar Email
            </a>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-all">
              <Video className="w-4 h-4" />
              Tutoriais em Vídeo
            </button>
          </div>
        </div>
      </div>

      {/* Category Filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              !activeCategory
                ? 'bg-primary-500 text-white'
                : 'bg-white text-gray-600 hover:text-white hover:bg-gray-100'
            }`}
          >
            Todas
          </button>
          {categories.map((cat) => {
            const Icon = iconMap[cat.icon] || HelpCircle;
            return (
              <button
                key={cat.slug}
                onClick={() => setActiveCategory(activeCategory === cat.slug ? null : cat.slug)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeCategory === cat.slug
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-gray-600 hover:text-white hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Featured FAQs */}
      {!searchQuery && !activeCategory && featuredFaqs.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredFaqs.slice(0, 3).map((faq, idx) => (
            <motion.div
              key={faq.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-gray-50 border border-gray-200 rounded-xl p-5 hover:border-brand-400 cursor-pointer transition-all group"
              onClick={() => toggleFaq(faq.id)}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-brand-100 flex-shrink-0">
                  <Zap className="w-4 h-4 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-medium text-white group-hover:text-brand-600 transition-colors">
                    {faq.question}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{faq.answer}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* FAQ Sections */}
      <div className="space-y-6">
        {groupedFaqs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-xl">
            <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Nenhum resultado encontrado</h3>
            <p className="text-gray-500">
              Tente buscar por outros termos ou entre em contato com nosso suporte.
            </p>
          </div>
        ) : (
          groupedFaqs.map((category) => {
            const Icon = iconMap[category.icon] || HelpCircle;
            return (
              <div key={category.slug} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-5 border-b border-gray-200">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${category.color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: category.color }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{category.name}</h2>
                    {category.description && (
                      <p className="text-sm text-gray-500">{category.description}</p>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-dark-700">
                  {category.faqs.map((faq) => (
                    <div key={faq.id} className="group">
                      <button
                        onClick={() => toggleFaq(faq.id)}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-100/30 transition-all"
                      >
                        <span className="font-medium text-white group-hover:text-brand-600 transition-colors pr-4">
                          {faq.question}
                        </span>
                        <ChevronDown
                          className={`w-5 h-5 text-gray-500 transition-transform flex-shrink-0 ${
                            expandedFaq === faq.id ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      <AnimatePresence>
                        {expandedFaq === faq.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-5">
                              <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                                {faq.answer}
                              </p>

                              {/* Feedback */}
                              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-200">
                                <span className="text-sm text-gray-400">Esta resposta foi útil?</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFeedback(faq.id, true);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-green-500/20 text-gray-500 hover:text-green-400 transition-all"
                                >
                                  <ThumbsUp className="w-4 h-4" />
                                  Sim
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFeedback(faq.id, false);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                  Não
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Contact Support Section */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="p-3 rounded-xl bg-green-500/20 w-fit mb-4">
            <MessageCircle className="w-6 h-6 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Chat ao Vivo</h3>
          <p className="text-gray-500 text-sm mb-4">
            Fale com nossa equipe em tempo real via WhatsApp.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <Clock className="w-4 h-4" />
            <span>Seg-Sex, 9h às 18h</span>
          </div>
          <a
            href="https://wa.me/5511999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Iniciar Chat
          </a>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="p-3 rounded-xl bg-blue-500/20 w-fit mb-4">
            <Mail className="w-6 h-6 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Email</h3>
          <p className="text-gray-500 text-sm mb-4">
            Envie sua dúvida detalhada por email.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <Clock className="w-4 h-4" />
            <span>Resposta em até 24h</span>
          </div>
          <a
            href="mailto:suporte@worder.com"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-all"
          >
            <Mail className="w-4 h-4" />
            Enviar Email
          </a>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="p-3 rounded-xl bg-purple-500/20 w-fit mb-4">
            <Video className="w-6 h-6 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tutoriais</h3>
          <p className="text-gray-500 text-sm mb-4">
            Assista vídeos explicativos sobre todas as funcionalidades.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <CheckCircle className="w-4 h-4" />
            <span>+50 vídeos disponíveis</span>
          </div>
          <button className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-medium transition-all">
            <Video className="w-4 h-4" />
            Ver Tutoriais
          </button>
        </div>
      </div>
    </div>
  );
}
