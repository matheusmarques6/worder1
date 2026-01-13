import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { WORDER_LOGO_BASE64 } from '../assets/logo'
import { COLORS } from '../constants'
import { SPACING, FONT_SIZES } from '../styles'

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.xl,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    marginBottom: SPACING.xl,
  },
  logo: {
    width: 120,
    height: 40,
  },
  titleSection: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginTop: SPACING.xs,
  },
})

interface ReportHeaderProps {
  title: string
  period?: string
  generatedAt?: string
  subtitle?: string
}

export function ReportHeader({ 
  title, 
  period, 
  generatedAt,
  subtitle 
}: ReportHeaderProps) {
  return (
    <View style={styles.header}>
      <Image style={styles.logo} src={WORDER_LOGO_BASE64} />
      <View style={styles.titleSection}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
        {period && (
          <Text style={styles.subtitle}>Período: {period}</Text>
        )}
        {generatedAt && (
          <Text style={styles.subtitle}>Gerado em: {generatedAt}</Text>
        )}
      </View>
    </View>
  )
}
