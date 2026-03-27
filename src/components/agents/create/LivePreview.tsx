'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, RefreshCw } from 'lucide-react';
import type { NicheTemplate } from '@/lib/ai/templates';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface LivePreviewProps {
  template: NicheTemplate;
  formData: Record<string, string>;
  persona: {
    tone: 'casual' | 'friendly' | 'professional' | 'luxury';
    responseLength: 'short' | 'medium' | 'long';
    replyDelay: number;
  };
}

// Mensagens de exemplo por nicho
const SAMPLE_CONVERSATIONS: Record<string, { user: string; assistant: string }[]> = {
  'moda-feminina': [
    { user: 'Oi! Quero um vestido para um casamento', assistant: 'Oi! 💕 Que legal! Casamento é uma ocasião especial! Você prefere algo mais clássico ou moderno? E é de dia ou à noite?' },
    { user: 'É à noite, prefiro algo elegante', assistant: 'Perfeito! ✨ Para casamento à noite, temos vestidos lindos em tons de azul marinho, verde esmeralda e preto. Qual sua numeração?' },
  ],
  'pet-shop': [
    { user: 'Qual ração vocês indicam para cachorro filhote?', assistant: 'Oi! 🐕 Que fofo, um filhote! Me conta: qual a raça e quantos meses ele tem? Assim consigo indicar a melhor opção!' },
    { user: 'É um Golden de 3 meses', assistant: 'Golden é uma raça maravilhosa! 🐾 Para filhotes de porte grande como o Golden, indico rações premium como Royal Canin ou Premier. Elas têm nutrientes específicos para crescimento saudável!' },
  ],
  'fitness': [
    { user: 'Quero começar a tomar whey, qual vocês recomendam?', assistant: 'E aí! 💪 Show que você quer começar! Me conta: qual seu objetivo principal? Ganhar massa, definir ou emagrecer?' },
    { user: 'Quero ganhar massa muscular', assistant: 'Perfeito! Para hipertrofia, recomendo Whey Concentrado - melhor custo-benefício! 🔥 Toma 1 scoop após o treino com água ou leite. Quer que eu te mostre as opções?' },
  ],
  'beleza': [
    { user: 'Preciso de uma rotina de skincare para pele oleosa', assistant: 'Oi! 💄 Vamos cuidar dessa pele! Para pele oleosa, a rotina básica é: limpeza suave + tônico + sérum + hidratante oil-free + protetor solar! Quer que eu indique produtos específicos?' },
    { user: 'Sim, pode indicar!', assistant: 'Perfeito! ✨ Para começar, recomendo: Gel de limpeza La Roche-Posay, Tônico adstringente, Sérum de niacinamida (controla oleosidade!) e Hidratante Effaclar. Esse combo é incrível!' },
  ],
  'delivery': [
    { user: 'Oi, quero fazer um pedido', assistant: 'Fala! 🍔 Beleza, o que vai ser hoje? Temos combos em promoção!' },
    { user: 'Me vê um hambúrguer duplo', assistant: 'Boa escolha! 🔥 Hambúrguer Duplo anotado! Quer adicionar batata e bebida por mais R$8? O combo sai mais em conta!' },
  ],
  'default': [
    { user: 'Olá!', assistant: 'Olá! 😊 Seja bem-vindo! Como posso ajudar você hoje?' },
    { user: 'Quero saber mais sobre os produtos', assistant: 'Claro! Temos várias opções disponíveis. O que você está procurando especificamente?' },
  ],
};

export function LivePreview({ template, formData, persona }: LivePreviewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inicializar com saudação
  useEffect(() => {
    const greeting = template.persona.greetings[0]
      ?.replace('{{storeName}}', formData.storeName || 'nossa loja') || 
      'Olá! Como posso ajudar?';

    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      },
    ]);
  }, [template, formData.storeName]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Simular resposta do bot
  const simulateResponse = (userMessage: string) => {
    setIsTyping(true);

    // Buscar conversa de exemplo do nicho
    const conversations = SAMPLE_CONVERSATIONS[template.id] || SAMPLE_CONVERSATIONS.default;
    
    // Tentar encontrar resposta relacionada
    let response = conversations[0]?.assistant || 'Entendi! Como posso ajudar com isso?';
    
    // Se for a segunda mensagem do usuário, usar segunda resposta
    if (messages.filter(m => m.role === 'user').length >= 1) {
      response = conversations[1]?.assistant || conversations[0]?.assistant || response;
    }

    // Personalizar resposta
    response = response
      .replace('{{storeName}}', formData.storeName || 'nossa loja');

    // Adicionar delay baseado na persona
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: response,
          timestamp: new Date(),
        },
      ]);
      setIsTyping(false);
    }, persona.replyDelay * 1000);
  };

  // Enviar mensagem
  const handleSend = () => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    simulateResponse(inputValue);
  };

  // Resetar conversa
  const handleReset = () => {
    const greeting = template.persona.greetings[0]
      ?.replace('{{storeName}}', formData.storeName || 'nossa loja') || 
      'Olá! Como posso ajudar?';

    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      },
    ]);
  };

  // Tom de voz
  const toneEmoji = {
    casual: '😎',
    friendly: '😊',
    professional: '👔',
    luxury: '✨',
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ backgroundColor: `${template.color}20` }}
          >
            {template.icon}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {formData.storeName || 'Seu Agente'}
            </p>
            <p className="text-xs text-zinc-500">
              Tom: {toneEmoji[persona.tone]} {persona.tone}
            </p>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          title="Resetar conversa"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[85%] px-3 py-2 rounded-2xl text-sm
                  ${message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                  }
                `}
              >
                {message.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-zinc-800 px-4 py-2 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Digite uma mensagem..."
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-2 text-center">
          Preview simulado • Respostas reais podem variar
        </p>
      </div>
    </div>
  );
}

export default LivePreview;
