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
      className={`niche ${selected ? 'on' : ''}`}
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
          <Check className="w-3 h-3" style={{ color: "#fff" }} />
        </motion.div>
      )}

      {/* Icon */}
      <div
        className="niche-ico"
        style={{ backgroundColor: `${color}20` }}
      >
        {icon}
      </div>

      {/* Content */}
      <h3 className="niche-name">{name}</h3>
      <p className="niche-desc line-clamp-2">{description}</p>
    </motion.button>
  );
}

export default NicheCard;
