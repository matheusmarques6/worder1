import '@/app/globals.css'

export const metadata = {
  title: 'Formulario',
}

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <style>{`
          html, body {
            background: transparent !important;
            background-color: transparent !important;
            margin: 0;
            padding: 0;
            min-height: auto;
          }
        `}</style>
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
