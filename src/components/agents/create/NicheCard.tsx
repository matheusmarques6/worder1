'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface NicheCardProps {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}

export function NicheCard({
  id,
  name,
  description,
  icon,
  color,
  selected,
  onClick,
}: NicheCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        relative p-4 rounded-xl border-2 text-left transition-all duration-200
        ${selected 
          ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20' 
          : 'border-gray-200 bg-gray-50/50 hover:border-gray-200 hover:bg-gray-50'
        }
      `}
      style={{
        borderColor: selected ? color : undefined,
        backgroundColor: selected ? `${color}10` : undefined,
      }}
    >
      {/* Selected indicator */}
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: color }}
        >
          <Check className="w-3 h-3 text-white" />
        </motion.div>
      )}

      {/* Icon */}
      <div 
        className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl mb-3"
        style={{ backgroundColor: `${color}20` }}
      >
        {icon}
      </div>

      {/* Content */}
      <h3 className="font-semibold text-gray-900 mb-1">{name}</h3>
      <p className="text-sm text-gray-500 line-clamp-2">{description}</p>
    </motion.button>
  );
}

export default NicheCard;
