'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { Card, Button, Input, Badge } from '@/components/ui';

// FAQ Data
const faqCategories = [
  {
    id: 'getting-started',
    name: 'Getting Started',
    icon: Zap,
    faqs: [
      {
        question: 'How do I connect my Shopify store?',
        answer: 'Go to Settings > Integrations > Shopify and click "Connect". You\'ll be redirected to Shopify to authorize the connection. Once approved, your store data will start syncing automatically within a few minutes.',
      },
      {
        question: 'What data is imported from Klaviyo?',
        answer: 'We import your campaigns, flows, segments, and subscriber data. This includes email metrics like opens, clicks, and conversions. Historical data for the past 12 months is imported initially.',
      },
      {
        question: 'How long does the initial data sync take?',
        answer: 'The initial sync typically takes 5-15 minutes depending on your store size. You\'ll see a progress indicator during the sync, and we\'ll notify you when it\'s complete.',
      },
    ],
  },
  {
    id: 'email-marketing',
    name: 'Email Marketing',
    icon: Mail,
    faqs: [
      {
        question: 'How is revenue attributed to emails?',
        answer: 'We use a 5-day attribution window by default. If a customer clicks an email and makes a purchase within 5 days, the revenue is attributed to that email. You can adjust this window in Settings.',
      },
      {
        question: 'Can I see individual campaign performance?',
        answer: 'Yes! Navigate to Analytics > Email to see detailed metrics for each campaign including sends, opens, clicks, conversions, and revenue generated.',
      },
      {
        question: 'What\'s the difference between flows and campaigns?',
        answer: 'Campaigns are one-time emails sent to a segment. Flows are automated email sequences triggered by customer actions (like abandoning a cart or making a purchase).',
      },
    ],
  },
  {
    id: 'crm',
    name: 'CRM & Pipelines',
    icon: Users,
    faqs: [
      {
        question: 'How do I create a custom pipeline?',
        answer: 'Click the pipeline selector dropdown and choose "Create Pipeline". Name your pipeline and add custom stages. You can drag and drop to reorder stages at any time.',
      },
      {
        question: 'Can I import contacts from a CSV?',
        answer: 'Yes! Go to CRM and click the import button. Upload your CSV file and map the columns to our fields. We support importing names, emails, phone numbers, and custom fields.',
      },
      {
        question: 'How do I assign deals to team members?',
        answer: 'Open any deal card and click on the assignee field. You can search for team members and assign multiple people to a single deal.',
      },
    ],
  },
  {
    id: 'automations',
    name: 'Automations',
    icon: Workflow,
    faqs: [
      {
        question: 'What triggers are available for automations?',
        answer: 'We support various triggers including: new order, abandoned cart, customer signup, tag added, specific date, segment entry, and custom webhooks.',
      },
      {
        question: 'Can I A/B test my automations?',
        answer: 'Yes! Add an A/B Split node to your automation to test different paths. You can set the split percentage and track which variation performs better.',
      },
      {
        question: 'How do I add delays between actions?',
        answer: 'Drag a Delay node from the Logic section in the node palette. You can set delays in minutes, hours, or days. The automation will pause at that point for the specified time.',
      },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: MessageSquare,
    faqs: [
      {
        question: 'How do I connect WhatsApp Business?',
        answer: 'Go to Settings > Integrations > WhatsApp and follow the setup wizard. You\'ll need a WhatsApp Business account and Facebook Business Manager access.',
      },
      {
        question: 'Are there message limits on WhatsApp?',
        answer: 'WhatsApp has tiered messaging limits based on your phone number quality rating. New numbers start with 1,000 business-initiated conversations per day.',
      },
      {
        question: 'Can I use message templates?',
        answer: 'Yes! You can create and manage message templates that need to be approved by WhatsApp. Once approved, you can use them in automations and manual conversations.',
      },
    ],
  },
  {
    id: 'billing',
    name: 'Billing & Plans',
    icon: CreditCard,
    faqs: [
      {
        question: 'How does pricing work?',
        answer: 'Pricing is based on the number of active contacts in your database. We offer Starter, Growth, and Enterprise plans with increasing feature access and contact limits.',
      },
      {
        question: 'Can I upgrade or downgrade my plan?',
        answer: 'Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades apply at the end of your billing cycle.',
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major credit cards (Visa, Mastercard, American Express), PIX, and bank transfer for Enterprise plans.',
      },
    ],
  },
];

const helpArticles = [
  {
    title: 'Complete Setup Guide',
    description: 'Step-by-step guide to getting your account configured',
    category: 'Getting Started',
    readTime: '10 min',
  },
  {
    title: 'Understanding Attribution',
    description: 'Learn how revenue is attributed to your marketing efforts',
    category: 'Analytics',
    readTime: '5 min',
  },
  {
    title: 'Building Your First Automation',
    description: 'Create powerful automated workflows from scratch',
    category: 'Automations',
    readTime: '8 min',
  },
  {
    title: 'WhatsApp Best Practices',
    description: 'Tips for effective WhatsApp marketing',
    category: 'WhatsApp',
    readTime: '6 min',
  },
];

const videoTutorials = [
  {
    title: 'Platform Overview',
    duration: '5:30',
    thumbnail: '/video-thumb-1.jpg',
  },
  {
    title: 'Creating Automations',
    duration: '12:45',
    thumbnail: '/video-thumb-2.jpg',
  },
  {
    title: 'CRM Deep Dive',
    duration: '8:20',
    thumbnail: '/video-thumb-3.jpg',
  },
];

interface FAQItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FAQItem({ question, answer, isOpen, onToggle }: FAQItemProps) {
  return (
    <div className="border-b border-slate-800 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 text-left group"
      >
        <span className="font-medium text-white group-hover:text-violet-400 transition-colors">
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-slate-400 leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('getting-started');
  const [openFAQs, setOpenFAQs] = useState<string[]>([]);

  const toggleFAQ = (id: string) => {
    setOpenFAQs((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const activeData = faqCategories.find((c) => c.id === activeCategory);

  // Filter FAQs based on search
  const filteredFAQs = searchQuery
    ? faqCategories.flatMap((cat) =>
        cat.faqs.filter(
          (faq) =>
            faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
        ).map((faq) => ({ ...faq, category: cat.name }))
      )
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center">
            <HelpCircle className="w-8 h-8 text-violet-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            How can we help you?
          </h1>
          <p className="text-slate-400">
            Search our help center or browse categories below
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 relative"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-800/50 border border-slate-700 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-white placeholder-slate-500 transition-all text-lg"
          />
        </motion.div>
      </div>

      {/* Search Results */}
      {filteredFAQs && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Search Results ({filteredFAQs.length})
          </h2>
          {filteredFAQs.length > 0 ? (
            <div className="space-y-4">
              {filteredFAQs.map((faq, index) => (
                <div key={index} className="p-4 bg-slate-800/30 rounded-xl">
                  <Badge className="mb-2">{faq.category}</Badge>
                  <h3 className="font-medium text-white mb-2">{faq.question}</h3>
                  <p className="text-sm text-slate-400">{faq.answer}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">
              No results found. Try different keywords or contact support.
            </p>
          )}
        </motion.div>
      )}

      {/* Quick Links */}
      {!searchQuery && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div className="glass-card rounded-xl p-6 hover:border-violet-500/30 transition-all group cursor-pointer">
            <div className="p-3 w-fit rounded-xl bg-violet-500/20 border border-violet-500/30 mb-4">
              <Book className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-white group-hover:text-violet-400 transition-colors">
              Documentation
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Comprehensive guides and API references
            </p>
            <div className="flex items-center gap-1 mt-3 text-sm text-violet-400">
              Browse docs <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 hover:border-cyan-500/30 transition-all group cursor-pointer">
            <div className="p-3 w-fit rounded-xl bg-cyan-500/20 border border-cyan-500/30 mb-4">
              <Video className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white group-hover:text-cyan-400 transition-colors">
              Video Tutorials
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Step-by-step video walkthroughs
            </p>
            <div className="flex items-center gap-1 mt-3 text-sm text-cyan-400">
              Watch videos <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 hover:border-emerald-500/30 transition-all group cursor-pointer">
            <div className="p-3 w-fit rounded-xl bg-emerald-500/20 border border-emerald-500/30 mb-4">
              <MessageCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
              Live Chat
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Get help from our support team
            </p>
            <div className="flex items-center gap-1 mt-3 text-sm text-emerald-400">
              Start chat <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </motion.div>
      )}

      {/* FAQ Section */}
      {!searchQuery && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-6"
        >
          {/* Categories */}
          <div className="glass-card rounded-xl p-4 h-fit">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Categories
            </h3>
            <nav className="space-y-1">
              {faqCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    activeCategory === category.id
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <category.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{category.name}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* FAQs */}
          <div className="lg:col-span-3 glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              {activeData && (
                <>
                  <div className="p-2 rounded-lg bg-violet-500/20">
                    <activeData.icon className="w-5 h-5 text-violet-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">
                    {activeData.name}
                  </h2>
                </>
              )}
            </div>
            <div>
              {activeData?.faqs.map((faq, index) => (
                <FAQItem
                  key={index}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openFAQs.includes(`${activeCategory}-${index}`)}
                  onToggle={() => toggleFAQ(`${activeCategory}-${index}`)}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Popular Articles */}
      {!searchQuery && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card rounded-xl p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Popular Articles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {helpArticles.map((article, index) => (
              <div
                key={index}
                className="p-4 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="default" className="mb-2">
                      {article.category}
                    </Badge>
                    <h3 className="font-medium text-white group-hover:text-violet-400 transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {article.description}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {article.readTime}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Contact Support */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card rounded-xl p-8 text-center"
      >
        <h2 className="text-xl font-semibold text-white mb-2">
          Still need help?
        </h2>
        <p className="text-slate-400 mb-6">
          Our support team is available Monday to Friday, 9am to 6pm BRT
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button variant="secondary" className="min-w-[200px]">
            <Mail className="w-4 h-4 mr-2" />
            Email Support
          </Button>
          <Button className="min-w-[200px]">
            <MessageCircle className="w-4 h-4 mr-2" />
            Start Live Chat
          </Button>
        </div>
        <div className="flex items-center justify-center gap-6 mt-6 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Average response: 2 hours
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-400" />
            Priority for Pro plans
          </div>
        </div>
      </motion.div>
    </div>
  );
}
