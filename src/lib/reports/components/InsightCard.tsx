import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from '../constants'
import { SPACING, FONT_SIZES } from '../styles'

const styles = StyleSheet.create({
  card: {
    padding: SPACING.md,
    borderRadius: 6,
    marginBottom: SPACING.sm,
  },
  positive: {
    backgroundColor: '#ecfdf5', // Verde claro
  },
  warning: {
    backgroundColor: '#fffbeb', // Amarelo claro
  },
  info: {
    backgroundColor: '#eff6ff', // Azul claro
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  icon: {
    fontSize: FONT_SIZES.md,
    marginRight: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginLeft: SPACING.lg + SPACING.sm, // Alinhado com o título
  },
})

// Cores do título por tipo
const titleColors = {
  positive: '#059669', // Verde escuro
  warning: '#d97706',  // Amarelo escuro
  info: '#2563eb',     // Azul escuro
}

// Ícones por tipo
const icons = {
  positive: '✓',
  warning: '⚠',
  info: 'ℹ',
}

interface InsightCardProps {
  type: 'positive' | 'warning' | 'info'
  title: string
  description: string
}

export function InsightCard({ type, title, description }: InsightCardProps) {
  return (
    <View style={[styles.card, styles[type]]} wrap={false}>
      <View style={styles.titleRow}>
        <Text style={[styles.icon, { color: titleColors[type] }]}>
          {icons[type]}
        </Text>
        <Text style={[styles.title, { color: titleColors[type] }]}>
          {title}
        </Text>
      </View>
      <Text style={styles.description}>{description}</Text>
    </View>
  )
}
