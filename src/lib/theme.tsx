'use client'

import { createContext, useContext, useState, useEffect } from 'react'

const STORAGE_KEY = 'theme'
const RADIUS_KEY = 'radius'
const BACKGROUND_KEY = 'background'
const TEXT_KEY = 'text'

export const RADIUS_MAP: Record<string, string> = {
  none: '0rem',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '1.25rem',
}

interface ThemeContextValue {
  theme: string
  setTheme: (theme: string) => void
  radius: string
  setRadius: (radius: string) => void
  background: string
  setBackground: (background: string) => void
  text: string
  setText: (text: string) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'default',
  setTheme: () => {},
  radius: 'md',
  setRadius: () => {},
  background: 'default',
  setBackground: () => {},
  text: 'default',
  setText: () => {},
})

export function ThemeProvider({
  children,
  defaultTheme = 'default',
}: {
  children: React.ReactNode
  defaultTheme?: string
}) {
  const [theme, setThemeState] = useState(defaultTheme)
  const [radius, setRadiusState] = useState('md')
  const [background, setBackgroundState] = useState('default')
  const [text, setTextState] = useState('default')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setThemeState(stored)
      const storedRadius = localStorage.getItem(RADIUS_KEY)
      if (storedRadius && RADIUS_MAP[storedRadius]) setRadiusState(storedRadius)
      const storedBackground = localStorage.getItem(BACKGROUND_KEY)
      if (storedBackground && storedBackground !== 'charcoal') setBackgroundState(storedBackground)
      else if (storedBackground === 'charcoal') localStorage.removeItem(BACKGROUND_KEY)
      const storedText = localStorage.getItem(TEXT_KEY)
      if (storedText) setTextState(storedText)
      // Clean up legacy custom-colors key if present
      localStorage.removeItem('custom-colors')
    } catch {
      // ignore
    }
  }, [])

  const setTheme = (t: string) => {
    setThemeState(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', t)
  }

  const setRadius = (r: string) => {
    setRadiusState(r)
    try { localStorage.setItem(RADIUS_KEY, r) } catch { /* ignore */ }
    if (r === 'md') document.documentElement.removeAttribute('data-radius')
    else document.documentElement.setAttribute('data-radius', r)
  }

  const setBackground = (b: string) => {
    setBackgroundState(b)
    try { localStorage.setItem(BACKGROUND_KEY, b) } catch { /* ignore */ }
    if (b === 'default') document.documentElement.removeAttribute('data-background')
    else document.documentElement.setAttribute('data-background', b)
  }

  const setText = (t: string) => {
    setTextState(t)
    try { localStorage.setItem(TEXT_KEY, t) } catch { /* ignore */ }
    if (t === 'default') document.documentElement.removeAttribute('data-text')
    else document.documentElement.setAttribute('data-text', t)
  }

  return (
    <ThemeContext.Provider value={{
      theme, setTheme,
      radius, setRadius,
      background, setBackground,
      text, setText,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

