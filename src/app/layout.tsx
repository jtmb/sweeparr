import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { preinit } from 'react-dom'
import './globals.css'
import Providers from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sweeparr',
  description: 'Plex media cleanup manager',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  preinit('/theme-init.js', { as: 'script' })
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-background text-foreground h-full`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
