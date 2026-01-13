import { Page, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from '../constants'
import { ReportFooter } from './Footer'
import { ReactNode } from 'react'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60, // Espaço para o footer
    fontFamily: 'Helvetica',
    backgroundColor: COLORS.background.white,
    fontSize: 12,
    color: COLORS.text.primary,
  },
})

interface PageWrapperProps {
  children: ReactNode
  showFooter?: boolean
  size?: 'A4' | 'LETTER'
}

export function PageWrapper({ 
  children, 
  showFooter = true,
  size = 'A4'
}: PageWrapperProps) {
  return (
    <Page size={size} style={styles.page}>
      {children}
      {showFooter && <ReportFooter />}
    </Page>
  )
}
