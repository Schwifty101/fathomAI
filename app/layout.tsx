import type { Metadata } from 'next'
import { Header } from '@/components/Header'
import { Toaster } from '@/components/Toaster'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Fathom Rebuild',
  description: 'AI meeting notetaker demo: transcripts, summaries, highlights and search.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-border focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Skip to main content
        </a>
        <Header />
        <main id="main-content" tabIndex={-1} className="outline-none">{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
