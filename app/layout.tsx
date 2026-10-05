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
        <Header />
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
