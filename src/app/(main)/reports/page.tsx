'use client'

import { useEffect, useState } from 'react'
import { formatBytes, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Trash2, RefreshCw, AlertTriangle, Plus } from 'lucide-react'
import Link from 'next/link'
import GenerateReportButton from '@/components/reports/GenerateReportButton'
import type { ReportSummary } from '@/types'

const STATUS_STYLES: Record<string, { label: string; class: string }> = {
  DRAFT: { label: 'Draft', class: 'text-muted-foreground bg-muted' },
  READY: { label: 'Ready', class: 'text-amber-400 bg-amber-500/20 border-amber-500/30' },
  EXECUTING: { label: 'Executing', class: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
  COMPLETED: { label: 'Completed', class: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
  FAILED: { label: 'Failed', class: 'text-rose-400 bg-rose-500/20 border-rose-500/30' },
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadReports = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReports(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReports() }, [])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDeleting(id)
    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE' })
      setReports((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cleanup candidate reports based on your rules
          </p>
        </div>
        <GenerateReportButton
          onSuccess={loadReports}
          onError={(msg) => setError(msg)}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No reports yet</p>
            <GenerateReportButton
              onSuccess={loadReports}
              onError={(msg) => setError(msg)}
              label="Generate Your First Report"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const style = STATUS_STYLES[report.status] ?? STATUS_STYLES.DRAFT
            return (
              <Link key={report.id} href={`/reports/${report.id}`}>
                <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent/20 transition-all cursor-pointer">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    {/* Rule names — report title */}
                    {report.ruleNames && report.ruleNames.length > 0 && (
                      <p className="text-sm font-medium truncate">
                        {report.ruleNames.join(', ')}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-semibold text-primary">
                        {report.totalItems} candidates
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(report.totalSizeBytes)} freeable
                      </span>
                      {report.triggeredBy && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground capitalize">{report.triggeredBy}</span>
                        </>
                      )}
                    </div>
                    {report.status === 'COMPLETED' && (
                      <p className="text-xs text-emerald-400 mt-0.5">
                        Removed {report.removedItems ?? 0} item{(report.removedItems ?? 0) === 1 ? '' : 's'} · Cleared {formatBytes(report.clearedBytes ?? 0)}
                        {(report.erroredItems ?? 0) > 0 && (
                          <span className="text-rose-400"> · {report.erroredItems} error{report.erroredItems !== 1 ? 's' : ''}</span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Generated {formatDate(report.generatedAt)}
                      {report.executedAt && ` · Executed ${formatDate(report.executedAt)}`}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style.class}`}>
                    {style.label}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, report.id)}
                    disabled={deleting === report.id}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0"
                    aria-label="Delete report"
                  >
                    {deleting === report.id
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
