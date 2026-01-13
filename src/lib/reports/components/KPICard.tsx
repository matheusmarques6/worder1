import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from '../constants'
import { SPACING, FONT_SIZES } from '../styles'

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background.gray,
    borderRadius: 8,
    padding: SPACING.lg,
    flex: 1,
    minWidth: '30%',
  },
  value: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginTop: SPACING.xs,
  },
  change: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
  },
  positive: {
    color: COLORS.success,
  },
  negative: {
    color: COLORS.danger,
  },
  neutral: {
    color: COLORS.text.muted,
  },
})

interface KPICardProps {
  value: string | number
  label: string
  change?: number | null
  changeLabel?: string
}

export function KPICard({ 
  value, 
  label, 
  change,
  changeLabel = 'vs anterior'
}: KPICardProps) {
  const hasChange = change !== undefined && change !== null && !isNaN(change)
  const isPositive = hasChange && change >= 0
  const arrow = isPositive ? '▲' : '▼'
  
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {hasChange && (
        <Text style={[
          styles.change,
          change === 0 ? styles.neutral : isPositive ? styles.positive : styles.negative
        ]}>
          {arrow} {Math.abs(change).toFixed(1)}% {changeLabel}
        </Text>
      )}
    </View>
  )
}
