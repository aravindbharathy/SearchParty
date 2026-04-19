import type { Metadata } from 'next'
import './globals.css'
import { LayoutShell } from './_components/layout-shell'

export const metadata: Metadata = {
  title: 'Search Party',
  description: 'AI-powered job search system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  )
}
