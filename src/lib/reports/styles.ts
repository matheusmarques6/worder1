import { StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './constants'

/**
 * Espaçamentos padrão
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/**
 * Tamanhos de fonte
 */
export const FONT_SIZES = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 24,
} as const

/**
 * Estilos base compartilhados para todos os relatórios
 */
export const baseStyles = StyleSheet.create({
  // Página
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: COLORS.background.white,
    fontSize: FONT_SIZES.md,
    color: COLORS.text.primary,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.xl,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    marginBottom: SPACING.xl,
  },
  headerLogo: {
    width: 120,
    height: 40,
  },
  headerTitleSection: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginTop: SPACING.xs,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    paddingTop: SPACING.md,
  },
  footerText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text.muted,
  },

  // Seções
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },

  // KPIs
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  kpiCard: {
    backgroundColor: COLORS.background.gray,
    borderRadius: 8,
    padding: SPACING.lg,
    flex: 1,
  },
  kpiValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  kpiLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginTop: SPACING.xs,
  },
  kpiChange: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
  },
  kpiPositive: {
    color: COLORS.success,
  },
  kpiNegative: {
    color: COLORS.danger,
  },

  // Tabelas
  table: {
    width: '100%',
    marginVertical: SPACING.md,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.secondary,
    padding: SPACING.sm,
  },
  tableHeaderCell: {
    color: COLORS.text.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    padding: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  tableRowAlternate: {
    backgroundColor: COLORS.background.gray,
  },
  tableCell: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.primary,
  },
  tableEmpty: {
    padding: SPACING.xl,
    textAlign: 'center',
    color: COLORS.text.muted,
    fontSize: FONT_SIZES.sm,
  },

  // Insights
  insightCard: {
    padding: SPACING.md,
    borderRadius: 6,
    marginBottom: SPACING.sm,
  },
  insightPositive: {
    backgroundColor: '#ecfdf5',
  },
  insightWarning: {
    backgroundColor: '#fffbeb',
  },
  insightInfo: {
    backgroundColor: '#eff6ff',
  },
  insightTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  insightDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
  },

  // Mensagens
  emptyState: {
    padding: SPACING.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text.muted,
    textAlign: 'center',
  },
  truncatedMessage: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text.muted,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
    textAlign: 'right',
  },

  // Utilitários
  row: {
    flexDirection: 'row',
  },
  col: {
    flexDirection: 'column',
  },
  textCenter: {
    textAlign: 'center',
  },
  textRight: {
    textAlign: 'right',
  },
  bold: {
    fontWeight: 'bold',
  },
  muted: {
    color: COLORS.text.muted,
  },
})

/**
 * Estilos específicos para tipos de relatório
 */
export const reportStyles = {
  general: StyleSheet.create({
    storeRow: {
      flexDirection: 'row',
      padding: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
  }),
  
  sales: StyleSheet.create({
    funnelStage: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    funnelBar: {
      height: 24,
      borderRadius: 4,
      marginRight: SPACING.sm,
    },
  }),
  
  forecast: StyleSheet.create({
    commitLevel: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.sm,
    },
    commitBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: 4,
      marginRight: SPACING.sm,
    },
  }),
}
