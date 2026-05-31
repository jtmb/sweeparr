import { NextRequest, NextResponse } from 'next/server'
import { getConnectionConfig } from '@/lib/db/queries'
import { createPlexClient } from '@/lib/plex/client'

export interface PlexItemDetail {
  ratingKey: string
  title: string
  originalTitle?: string
  year?: number
  summary?: string
  tagline?: string
  rating?: number
  audienceRating?: number
  ratingImage?: string
  audienceRatingImage?: string
  contentRating?: string
  studio?: string
  duration?: number
  thumb?: string
  art?: string
  type: string
  Genre?: Array<{ tag: string }>
  Director?: Array<{ tag: string }>
  Writer?: Array<{ tag: string }>
  Role?: Array<{ tag: string; role?: string; thumb?: string }>
  Collection?: Array<{ tag: string }>
  // TV-specific
  leafCount?: number
  viewedLeafCount?: number
  childCount?: number
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ratingKey: string }> }
) {
  const { ratingKey } = await params

  if (!ratingKey || !/^\d+$/.test(ratingKey)) {
    return NextResponse.json({ error: 'Invalid ratingKey' }, { status: 400 })
  }

  const cfg = await getConnectionConfig()
  if (!cfg.plexUrl || !cfg.plexToken) {
    return NextResponse.json({ error: 'Plex not configured' }, { status: 503 })
  }

  const plex = createPlexClient(cfg.plexUrl, cfg.plexToken)
  const item = await plex.getItemDetail(ratingKey)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(item)
}
