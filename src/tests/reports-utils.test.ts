/**
 * Testes para funções utilitárias de relatórios
 */

import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatDate,
  formatDateTime,
  formatReportPeriod,
  calculateChange,
  calculatePreviousPeriod,
  calculatePeriodDates,
  formatDays,
  formatROAS,
  truncateText,
  safeText,
} from '@/lib/reports/utils'

describe('formatCurrency', () => {
  it('formata valor positivo corretamente', () => {
    expect(formatCurrency(1234.56)).toContain('1.234,56')
  })

  it('retorna R$ 0,00 para null', () => {
    expect(formatCurrency(null)).toBe('R$ 0,00')
  })

  it('retorna R$ 0,00 para undefined', () => {
    expect(formatCurrency(undefined)).toBe('R$ 0,00')
  })

  it('retorna R$ 0,00 para NaN', () => {
    expect(formatCurrency(NaN)).toBe('R$ 0,00')
  })

  it('formata valores grandes corretamente', () => {
    expect(formatCurrency(1000000)).toContain('1.000.000')
  })
})

describe('formatPercent', () => {
  it('formata porcentagem com 1 casa decimal por padrão', () => {
    expect(formatPercent(45.678)).toBe('45.7%')
  })

  it('formata porcentagem com casas decimais customizadas', () => {
    expect(formatPercent(45.678, 2)).toBe('45.68%')
  })

  it('retorna 0% para null', () => {
    expect(formatPercent(null)).toBe('0%')
  })

  it('retorna 0% para undefined', () => {
    expect(formatPercent(undefined)).toBe('0%')
  })
})

describe('calculateChange', () => {
  it('calcula variação positiva corretamente', () => {
    expect(calculateChange(120, 100)).toBe(20)
  })

  it('calcula variação negativa corretamente', () => {
    expect(calculateChange(80, 100)).toBe(-20)
  })

  it('retorna 0 quando ambos valores são 0', () => {
    expect(calculateChange(0, 0)).toBe(0)
  })

  it('retorna 100 quando anterior é 0 e atual é positivo', () => {
    expect(calculateChange(100, 0)).toBe(100)
  })

  it('retorna 0 quando atual é 0 e anterior é 0', () => {
    expect(calculateChange(0, 0)).toBe(0)
  })

  it('calcula com precisão de 1 casa decimal', () => {
    expect(calculateChange(133, 100)).toBe(33)
    expect(calculateChange(133.33, 100)).toBe(33.3)
  })
})

describe('calculatePreviousPeriod', () => {
  it('calcula período anterior de 30 dias corretamente', () => {
    const startDate = new Date('2024-02-01')
    const endDate = new Date('2024-02-29')
    
    const { previousStartDate, previousEndDate } = calculatePreviousPeriod(startDate, endDate)
    
    // Período anterior deve ter mesma duração (28 dias)
    const prevDuration = Math.round(
      (previousEndDate.getTime() - previousStartDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    expect(prevDuration).toBe(28)
    
    // previousEndDate deve ser 1 dia antes de startDate
    expect(previousEndDate.toISOString().split('T')[0]).toBe('2024-01-31')
  })

  it('calcula período anterior de 7 dias', () => {
    const startDate = new Date('2024-01-15')
    const endDate = new Date('2024-01-22')
    
    const { previousStartDate, previousEndDate } = calculatePreviousPeriod(startDate, endDate)
    
    expect(previousEndDate.toISOString().split('T')[0]).toBe('2024-01-14')
    expect(previousStartDate.toISOString().split('T')[0]).toBe('2024-01-07')
  })
})

describe('calculatePeriodDates', () => {
  it('calcula período de 7 dias', () => {
    const { startDate, endDate } = calculatePeriodDates('7d')
    const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    expect(diff).toBe(7)
  })

  it('calcula período de 30 dias', () => {
    const { startDate, endDate } = calculatePeriodDates('30d')
    const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    expect(diff).toBe(30)
  })

  it('calcula período de 90 dias', () => {
    const { startDate, endDate } = calculatePeriodDates('90d')
    const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    expect(diff).toBe(90)
  })

  it('usa 30 dias como padrão para período inválido', () => {
    const { startDate, endDate } = calculatePeriodDates('invalid')
    const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    expect(diff).toBe(30)
  })

  it('calcula período do mês atual', () => {
    const { startDate } = calculatePeriodDates('month')
    expect(startDate.getDate()).toBe(1)
  })
})

describe('formatDays', () => {
  it('formata 1 dia como singular', () => {
    expect(formatDays(1)).toBe('1 dia')
  })

  it('formata múltiplos dias como plural', () => {
    expect(formatDays(5)).toBe('5 dias')
  })

  it('arredonda valores decimais', () => {
    expect(formatDays(3.7)).toBe('4 dias')
  })

  it('retorna - para null', () => {
    expect(formatDays(null)).toBe('-')
  })
})

describe('formatROAS', () => {
  it('formata ROAS positivo', () => {
    expect(formatROAS(3.5)).toBe('3.50x')
  })

  it('retorna 0.00x para null', () => {
    expect(formatROAS(null)).toBe('0.00x')
  })

  it('formata com 2 casas decimais', () => {
    expect(formatROAS(2.333)).toBe('2.33x')
  })
})

describe('truncateText', () => {
  it('não trunca texto menor que o limite', () => {
    expect(truncateText('Curto', 10)).toBe('Curto')
  })

  it('trunca texto maior que o limite', () => {
    expect(truncateText('Texto muito longo para exibir', 10)).toBe('Texto m...')
  })

  it('retorna - para null', () => {
    expect(truncateText(null, 10)).toBe('-')
  })
})

describe('safeText', () => {
  it('retorna valor se não for nulo', () => {
    expect(safeText('texto')).toBe('texto')
  })

  it('retorna fallback para null', () => {
    expect(safeText(null)).toBe('-')
  })

  it('retorna fallback customizado', () => {
    expect(safeText(null, 'N/A')).toBe('N/A')
  })

  it('converte números para string', () => {
    expect(safeText(123)).toBe('123')
  })
})

describe('formatDate', () => {
  it('formata data no padrão brasileiro', () => {
    const result = formatDate('2024-01-15')
    expect(result).toBe('15/01/2024')
  })

  it('retorna - para null', () => {
    expect(formatDate(null)).toBe('-')
  })

  it('retorna - para data inválida', () => {
    expect(formatDate('invalid')).toBe('-')
  })
})

describe('formatReportPeriod', () => {
  it('formata período corretamente', () => {
    const result = formatReportPeriod(
      new Date('2024-01-01'),
      new Date('2024-01-31')
    )
    expect(result).toBe('01/01/2024 - 31/01/2024')
  })

  it('aceita strings de data', () => {
    const result = formatReportPeriod('2024-01-01', '2024-01-31')
    expect(result).toBe('01/01/2024 - 31/01/2024')
  })
})
