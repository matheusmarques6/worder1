import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from '../constants'
import { SPACING, FONT_SIZES } from '../styles'

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    paddingTop: SPACING.md,
  },
  text: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text.muted,
  },
})

interface ReportFooterProps {
  companyText?: string
}

export function ReportFooter({ 
  companyText = 'Worder CRM - worder.com.br' 
}: ReportFooterProps) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.text}>{companyText}</Text>
      <Text
        style={styles.text}
        render={({ pageNumber, totalPages }) => 
          `Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  )
}
