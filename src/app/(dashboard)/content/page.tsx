'use client';
import Link from 'next/link';
import { Mail, MessageCircle, Image, Ticket, Package } from 'lucide-react';

const contentSections = [
  {
    title: 'Templates Email',
    description: 'Gerencie templates de email marketing',
    icon: Mail,
    href: '/content/templates',
    color: 'text-blue-500 bg-blue-50',
  },
  {
    title: 'Templates WhatsApp',
    description: 'Templates aprovados do WhatsApp Business',
    icon: MessageCircle,
    href: '/content/whatsapp-templates',
    color: 'text-green-500 bg-green-50',
  },
  {
    title: 'Mídia',
    description: 'Biblioteca de imagens e arquivos',
    icon: Image,
    href: '/content/media',
    color: 'text-purple-500 bg-purple-50',
  },
  {
    title: 'Cupons',
    description: 'Gerencie cupons de desconto',
    icon: Ticket,
    href: '/content/coupons',
    color: 'text-orange-500 bg-orange-50',
  },
  {
    title: 'Produtos',
    description: 'Produtos importados da sua loja',
    icon: Package,
    href: '/content/products',
    color: 'text-indigo-500 bg-indigo-50',
  },
];

export default function ContentHubPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Conteúdo</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie todo o conteúdo da sua organização</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contentSections.map(section => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow group"
            >
              <div
                className={`w-10 h-10 rounded-lg ${section.color} flex items-center justify-center mb-4`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                {section.title}
              </h3>
              <p className="text-xs text-gray-500 mt-1">{section.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
