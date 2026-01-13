import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from '../constants'
import { SPACING, FONT_SIZES } from '../styles'
import { ReactNode } from 'react'

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  content: {
    // Container para o conteúdo
  },
})

interface SectionProps {
  title: string
  children: ReactNode
}

export function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.content}>
        {children}
      </View>
    </View>
  )
}
