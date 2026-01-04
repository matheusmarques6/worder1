import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Worder - Email Marketing Analytics & CRM',
  description: 'Track your email marketing ROI, manage customers, and automate communications',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="font-sans bg-slate-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
