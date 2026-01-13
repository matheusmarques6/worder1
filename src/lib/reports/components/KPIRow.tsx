import { View, StyleSheet } from '@react-pdf/renderer'
import { SPACING } from '../styles'
import { ReactNode } from 'react'

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
})

interface KPIRowProps {
  children: ReactNode
}

export function KPIRow({ children }: KPIRowProps) {
  return (
    <View style={styles.row}>
      {children}
    </View>
  )
}
