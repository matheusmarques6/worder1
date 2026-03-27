'use client';
import { Mail } from 'lucide-react';

export default function ContentTemplatesPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Templates de Email</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie seus templates de email marketing</p>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Templates de Email</h3>
        <p className="text-sm text-gray-500 mb-4">Os templates de email são gerenciados na seção de Email Marketing</p>
      </div>
    </div>
  );
}
