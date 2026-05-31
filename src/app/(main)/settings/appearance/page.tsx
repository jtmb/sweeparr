'use client'

import { useTheme } from '@/lib/theme'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check, RotateCcw } from 'lucide-react'

const THEMES = [
  { id: 'default',   label: 'Default',   color: '#EFA633', description: 'Radarr orange' },
  { id: 'sonarr',    label: 'Sonarr',    color: '#14B8A6', description: 'Sonarr teal' },
  { id: 'prowlarr',  label: 'Prowlarr',  color: '#F97316', description: 'Prowlarr orange' },
  { id: 'jellyfin',  label: 'Jellyfin',  color: '#8B5CF6', description: 'Jellyfin purple' },
  { id: 'lidarr',    label: 'Lidarr',    color: '#22C55E', description: 'Lidarr green' },
  { id: 'readarr',   label: 'Readarr',   color: '#F59E0B', description: 'Readarr gold' },
  { id: 'bazarr',    label: 'Bazarr',    color: '#F43F5E', description: 'Bazarr rose' },
  { id: 'whisparr',  label: 'Whisparr',  color: '#EC4899', description: 'Whisparr pink' },
  { id: 'silver',    label: 'Silver',    color: '#ADBECF', description: 'Soft silver' },
  { id: 'stone',     label: 'Stone',     color: '#b8b8c7', description: 'Muted stone' },
]

const BACKGROUNDS = [
  { id: 'default',   label: 'Default',   bg: 'hsl(220 12% 12%)',  card: 'hsl(220 12% 16%)',  description: 'Radarr dark' },
  { id: 'black',     label: 'Black',     bg: 'hsl(0 0% 4%)',     card: 'hsl(0 0% 9%)',      description: 'Pure black' },
  { id: 'slate',     label: 'Slate',     bg: 'hsl(215 25% 9%)',  card: 'hsl(215 25% 13%)',  description: 'Cool slate' },
  { id: 'navy',      label: 'Navy',      bg: 'hsl(228 38% 8%)',  card: 'hsl(228 38% 12%)',  description: 'Deep navy' },
  { id: 'warm',      label: 'Warm',      bg: 'hsl(20 10% 10%)',  card: 'hsl(20 10% 14%)',   description: 'Warm dark' },
]

const TEXT_COLOURS = [
  { id: 'default',  label: 'Default',   color: '#ffffff', description: 'Pure white' },
  { id: 'offwhite', label: 'Off-white', color: '#e5e5e5', description: 'Neutral grey' },
]

// Preview px values matching the CSS rem values (base 16px)
const RADII = [
  { id: 'none', label: 'None',    px: 0 },
  { id: 'sm',   label: 'Small',   px: 4 },
  { id: 'md',   label: 'Default', px: 8 },
  { id: 'lg',   label: 'Large',   px: 12 },
  { id: 'full', label: 'Pill',    px: 9999 },
]

export default function AppearancePage() {
  const {
    theme, setTheme,
    radius, setRadius,
    background, setBackground,
    text, setText,
  } = useTheme()

  const handleReset = () => {
    setTheme('default')
    setRadius('md')
    setBackground('default')
    setText('default')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Appearance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Customize the look and feel of Sweeparr
        </p>
      </div>

      {/* Accent colour */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accent Colour</CardTitle>
          <CardDescription>Choose an accent colour theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-center transition-all hover:bg-accent/50',
                  theme === t.id ? 'border-primary' : 'border-border'
                )}
              >
                {theme === t.id && (
                  <div className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                )}
                <div
                  className="h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-card"
                  style={{ backgroundColor: t.color }}
                />
                <div>
                  <p className="text-xs font-medium leading-tight">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Background */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Background</CardTitle>
          <CardDescription>Controls the base background and surface colours</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBackground(b.id)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-center transition-all hover:opacity-90',
                  background === b.id ? 'border-primary' : 'border-border'
                )}
              >
                {background === b.id && (
                  <div className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                )}
                <div
                  className="h-10 w-16 rounded overflow-hidden border border-white/10 flex"
                  style={{ backgroundColor: b.bg }}
                >
                  <div className="w-3 h-full" style={{ backgroundColor: b.bg, filter: 'brightness(0.85)' }} />
                  <div className="flex-1 p-1 flex flex-col gap-0.5">
                    <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: b.card }} />
                    <div className="h-1.5 w-3/4 rounded-sm" style={{ backgroundColor: b.card }} />
                    <div className="h-1.5 w-5/6 rounded-sm" style={{ backgroundColor: b.card }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium leading-tight">{b.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{b.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Text colour */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Text Colour</CardTitle>
          <CardDescription>Choose the primary text colour</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {TEXT_COLOURS.map((t) => (
              <button
                key={t.id}
                onClick={() => setText(t.id)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-center transition-all hover:bg-accent/50',
                  text === t.id ? 'border-primary' : 'border-border'
                )}
              >
                {text === t.id && (
                  <div className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                )}
                {/* Preview: text-coloured lines on a dark card swatch */}
                <div className="h-10 w-16 rounded bg-card border border-border flex flex-col justify-center px-2 gap-1.5">
                  <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: t.color }} />
                  <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: t.color, opacity: 0.55 }} />
                </div>
                <div>
                  <p className="text-xs font-medium leading-tight">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Border radius */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Border Radius</CardTitle>
          <CardDescription>Controls the roundness of cards, buttons, and inputs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {RADII.map((r) => (
              <button
                key={r.id}
                onClick={() => setRadius(r.id)}
                className={cn(
                  'flex flex-col items-center gap-2.5 px-3 py-3 border-2 transition-all hover:bg-accent/50 rounded-lg',
                  radius === r.id ? 'border-primary' : 'border-border',
                )}
              >
                <div className="flex flex-col gap-1.5">
                  <div
                    className="h-9 w-16 bg-secondary border border-border/80 flex flex-col justify-end p-1 gap-1"
                    style={{ borderRadius: Math.min(r.px, 10) }}
                  >
                    <div className="h-1 w-3/4 bg-muted-foreground/30 rounded-full" />
                    <div className="h-1 w-1/2 bg-muted-foreground/20 rounded-full" />
                  </div>
                  <div
                    className="h-5 w-16 bg-primary/80 flex items-center justify-center"
                    style={{ borderRadius: r.px }}
                  >
                    <div className="h-1 w-6 bg-white/50 rounded-full" />
                  </div>
                </div>
                <span className="text-xs font-medium">{r.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Sweeparr — Plex Media Cleanup Manager</p>
          <p>Integrates with Plex, Radarr, and Sonarr to help you reclaim disk space.</p>
        </CardContent>
      </Card>
    </div>
  )
}
