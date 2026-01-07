'use client';

import { useState, useCallback, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}

// Formatar telefone brasileiro
function formatPhone(value: string): string {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, '');
  
  // Limita a 11 dígitos (DDD + 9 dígitos)
  const limited = numbers.slice(0, 11);
  
  // Aplica máscara
  if (limited.length === 0) return '';
  if (limited.length <= 2) return `(${limited}`;
  if (limited.length <= 7) return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
  if (limited.length <= 11) return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`;
  
  return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7, 11)}`;
}

// Remover formatação
function unformatPhone(value: string): string {
  return value.replace(/\D/g, '');
}

// Validar telefone
function isValidPhone(value: string): boolean {
  const numbers = unformatPhone(value);
  // Válido se tiver 10 (fixo) ou 11 (celular) dígitos
  return numbers.length >= 10 && numbers.length <= 11;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = '', onChange, error, className, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState(formatPhone(value));

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      const formatted = formatPhone(input);
      setDisplayValue(formatted);
      
      // Retorna o valor sem formatação para o parent
      onChange?.(unformatPhone(formatted));
    }, [onChange]);

    // Atualizar quando value externo muda
    if (formatPhone(value) !== displayValue && value !== unformatPhone(displayValue)) {
      setDisplayValue(formatPhone(value));
    }

    return (
      <div className="relative">
        <input
          ref={ref}
          type="tel"
          value={displayValue}
          onChange={handleChange}
          placeholder="(11) 99999-9999"
          className={cn(
            'w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-xl text-white',
            'focus:outline-none focus:border-primary-500 transition-colors',
            'placeholder:text-dark-500',
            error && 'border-red-500 focus:border-red-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export { formatPhone, unformatPhone, isValidPhone };
export default PhoneInput;
