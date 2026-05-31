'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Film, Tv } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PosterImageProps {
  src?: string | null
  alt: string
  mediaType?: 'movie' | 'show'
  className?: string
  width?: number
  height?: number
  /** When true, fills the nearest positioned parent (set position:relative + known dimensions on the parent) */
  fill?: boolean
  sizes?: string
}

export default function PosterImage({
  src,
  alt,
  mediaType = 'movie',
  className,
  width = 80,
  height = 120,
  fill: fillContainer = false,
  sizes,
}: PosterImageProps) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded bg-muted text-muted-foreground',
          className
        )}
        style={fillContainer ? undefined : { width, height }}
      >
        {mediaType === 'show' ? (
          <Tv className="h-6 w-6 opacity-30" />
        ) : (
          <Film className="h-6 w-6 opacity-30" />
        )}
      </div>
    )
  }

  // If the poster URL comes from Radarr/Sonarr, proxy through our API
  let proxiedSrc: string
  if (src.startsWith('http')) {
    proxiedSrc = src
  } else if (src.startsWith('/library/')) {
    // Plex thumb path — proxy with Plex auth
    proxiedSrc = `/api/images/plex?url=${encodeURIComponent(src)}`
  } else {
    proxiedSrc = `/api/images/${mediaType === 'movie' ? 'radarr' : 'sonarr'}?url=${encodeURIComponent(src)}`
  }

  return (
    <div
      className={cn('relative overflow-hidden rounded', className)}
      style={fillContainer ? undefined : { width, height }}
    >
      <Image
        src={proxiedSrc}
        alt={alt}
        fill
        className="object-cover"
        onError={() => setError(true)}
        sizes={sizes ?? (fillContainer ? '(max-width: 768px) 50vw, 25vw' : `${width}px`)}
        unoptimized
        decoding="async"
      />
    </div>
  )
}
