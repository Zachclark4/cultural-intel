import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Cultural Intel — Viral Content Intelligence',
  description: 'A Bloomberg Terminal for Culture. Real-time viral content intelligence for music marketing teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body
        style={{
          background: '#f5f5f5',
          color: '#0a0a0a',
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {children}
        </div>
      </body>
    </html>
  )
}
