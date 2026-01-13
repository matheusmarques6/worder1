import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS, REPORT_MESSAGES } from '../constants'
import { SPACING, FONT_SIZES } from '../styles'

const styles = StyleSheet.create({
  table: {
    width: '100%',
    marginVertical: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.secondary,
    padding: SPACING.sm,
    minHeight: 28,
  },
  headerCell: {
    color: COLORS.text.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    padding: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    minHeight: 28,
  },
  rowAlternate: {
    backgroundColor: COLORS.background.gray,
  },
  cell: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.primary,
  },
  cellRight: {
    textAlign: 'right',
  },
  cellCenter: {
    textAlign: 'center',
  },
  emptyState: {
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
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
})

type CellAlignment = 'left' | 'center' | 'right'

interface TableProps {
  headers: string[]
  rows: (string | number | null | undefined)[][]
  columnWidths?: string[]
  columnAligns?: CellAlignment[]
  emptyMessage?: string
  truncatedMessage?: string
  zebra?: boolean
  maxRows?: number
}

export function Table({
  headers,
  rows,
  columnWidths,
  columnAligns,
  emptyMessage = REPORT_MESSAGES.NO_DATA,
  truncatedMessage,
  zebra = false,
  maxRows,
}: TableProps) {
  const defaultWidth = `${100 / headers.length}%`
  
  // Aplicar limite de linhas se especificado
  const displayRows = maxRows && rows.length > maxRows 
    ? rows.slice(0, maxRows) 
    : rows
  const wasTruncated = maxRows && rows.length > maxRows

  // Renderizar célula com alinhamento
  const getCellStyle = (index: number) => {
    const align = columnAligns?.[index] || 'left'
    const width = columnWidths?.[index] || defaultWidth
    
    return [
      styles.cell,
      { width },
      align === 'right' && styles.cellRight,
      align === 'center' && styles.cellCenter,
    ].filter(Boolean)
  }

  const getHeaderStyle = (index: number) => {
    const align = columnAligns?.[index] || 'left'
    const width = columnWidths?.[index] || defaultWidth
    
    return [
      styles.headerCell,
      { width },
      align === 'right' && styles.cellRight,
      align === 'center' && styles.cellCenter,
    ].filter(Boolean)
  }

  // Estado vazio
  if (rows.length === 0) {
    return (
      <View style={styles.table}>
        <View style={styles.headerRow}>
          {headers.map((header, i) => (
            <Text key={i} style={getHeaderStyle(i) as object[]}>
              {header}
            </Text>
          ))}
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.table}>
      {/* Header */}
      <View style={styles.headerRow}>
        {headers.map((header, i) => (
          <Text key={i} style={getHeaderStyle(i) as object[]}>
            {header}
          </Text>
        ))}
      </View>
      
      {/* Rows */}
      {displayRows.map((row, rowIndex) => (
        <View 
          key={rowIndex} 
          style={[
            styles.row,
            zebra && rowIndex % 2 === 1 && styles.rowAlternate,
          ]}
          wrap={false}
        >
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} style={getCellStyle(cellIndex) as object[]}>
              {cell ?? '-'}
            </Text>
          ))}
        </View>
      ))}

      {/* Mensagem de truncamento */}
      {(wasTruncated || truncatedMessage) && (
        <Text style={styles.truncatedMessage}>
          {truncatedMessage || REPORT_MESSAGES.TRUNCATED(displayRows.length, rows.length)}
        </Text>
      )}
    </View>
  )
}
