import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fathom Rebuild',
  description: 'AI meeting notetaker demo: transcripts, summaries, highlights and search.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  )
}
