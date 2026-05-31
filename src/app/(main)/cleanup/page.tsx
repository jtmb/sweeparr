'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import Link from 'next/link'
import GenerateReportButton from '@/components/reports/GenerateReportButton'

export default function CleanupPage() {
  const [result, setResult] = useState<{ reportId?: string; error?: string } | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cleanup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Analyze your libraries and remove unused media
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Generate Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan all libraries against your cleanup rules and generate a candidate report.
              You can review the candidates before executing any deletions.
            </p>
            <GenerateReportButton
              onSuccess={(id) => setResult({ reportId: id })}
              onError={(msg) => setResult({ error: msg })}
              className="w-full"
            />

            {result?.reportId && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="flex-1 text-sm text-emerald-300">Report generated successfully.</div>
                <Link href={`/reports/${result.reportId}`}>
                  <Button size="sm" variant="outline">View</Button>
                </Link>
              </div>
            )}

            {result?.error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {result.error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Safety Guidelines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                'Items currently being watched are always protected',
                'Configure minimum age thresholds to protect recently added media',
                'Use "Protect Never Watched" to avoid removing unwatched content',
                'Deletions are performed through Radarr/Sonarr — they respect their state',
                'Review every report before executing. This action is irreversible.',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  {tip}
                </li>
              ))}
            </ul>
            <Link href="/settings/rules">
              <Button variant="outline" size="sm" className="w-full mt-2">
                Configure Cleanup Rules
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-border p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Want to review previous reports?{' '}
          <Link href="/reports" className="text-primary hover:underline">View all reports →</Link>
        </p>
      </div>
    </div>
  )
}
