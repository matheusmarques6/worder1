import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Worder - Email Marketing Analytics & CRM',
  description: 'Track your email marketing ROI, manage customers, and automate communications',
  icons: {
    icon: '/worder favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Resilience against in-browser auto-translation (Google Translate,
            Chrome/Edge built-in translate). The translator wraps text nodes
            in <font> elements; when React later removes/moves those nodes the
            DOM no longer matches its virtual tree and it throws
            "NotFoundError: Failed to execute 'insertBefore'/'removeChild' on
            'Node'", white-screening the whole dashboard. This well-known
            patch makes those two DOM ops no-op (instead of throwing) in the
            exact "node is not a child of this parent" case, so translation
            can run without crashing React. Must execute before hydration —
            hence an inline head script. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof Node!=="function"||!Node.prototype)return;var r=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c&&c.parentNode!==this){return c;}return r.apply(this,arguments);};var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,ref){if(ref&&ref.parentNode!==this){return n;}return i.apply(this,arguments);};})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        {/* Plus Jakarta Sans + Geist Mono — scoped to the Agentes de IA redesign (.agents-theme) */}
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
