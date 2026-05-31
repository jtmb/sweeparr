'use client'

import { ThemeProvider } from '@/lib/theme'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="default">
      {children}
    </ThemeProvider>
  )
}
