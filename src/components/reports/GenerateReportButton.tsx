'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText, Plus, RefreshCw, CheckSquare, Square } from 'lucide-react'

interface RuleOption {
  id: string
  name: string
  libraryId: string | null
  enabled: boolean
}

interface Props {
  /** Called with the new report ID after a successful generation */
  onSuccess: (reportId: string) => void
  /** Called with an error message on failure */
  onError?: (message: string) => void
  /** Extra classes forwarded to the trigger button */
  className?: string
  /** Override the button label (default: "Generate Report") */
  label?: string
}

export default function GenerateReportButton({ onSuccess, onError, className, label }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rules, setRules] = useState<RuleOption[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)

  const openDialog = async () => {
    setDialogOpen(true)
    setRulesLoading(true)
    try {
      const res = await fetch('/api/rules')
      const data: RuleOption[] = await res.json()
      // Only show enabled rules
      const enabled = data.filter((r) => r.enabled)
      setRules(enabled)
      setSelectedRuleIds(new Set(enabled.map((r) => r.id)))
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : String(e))
      setDialogOpen(false)
    } finally {
      setRulesLoading(false)
    }
  }

  const toggleRule = (id: string) => {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedRuleIds.size === rules.length) {
      setSelectedRuleIds(new Set())
    } else {
      setSelectedRuleIds(new Set(rules.map((r) => r.id)))
    }
  }

  const handleGenerate = async () => {
    setDialogOpen(false)
    setGenerating(true)
    try {
      // If every enabled rule is selected, send no ruleIds (engine uses all enabled rules).
      const body =
        selectedRuleIds.size === rules.length
          ? undefined
          : { ruleIds: [...selectedRuleIds] }

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSuccess(data.reportId)
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const allSelected = rules.length > 0 && selectedRuleIds.size === rules.length
  const someSelected = selectedRuleIds.size > 0 && !allSelected

  return (
    <>
      <Button onClick={openDialog} disabled={generating} className={className}>
        {generating ? (
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        {generating ? 'Generating…' : (label ?? 'Generate Report')}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
            <DialogDescription>
              Choose which rules to include. All enabled rules are pre-selected.
            </DialogDescription>
          </DialogHeader>

          {rulesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No enabled rules. Enable rules in Settings → Rules first.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Select-all toggle */}
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/40 transition-colors text-left"
              >
                {allSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                ) : someSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary/50 shrink-0" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedRuleIds.size} / {rules.length}
                </span>
              </button>

              <div className="border-t border-border" />

              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {rules.map((rule) => (
                  <button
                    key={rule.id}
                    onClick={() => toggleRule(rule.id)}
                    className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2.5 text-sm text-left transition-colors
                      ${selectedRuleIds.has(rule.id) ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-accent/40'}
                    `}
                  >
                    {selectedRuleIds.has(rule.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{rule.name}</span>
                      {rule.libraryId && (
                        <span className="ml-2 text-xs text-primary/70">{rule.libraryId}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={selectedRuleIds.size === 0}>
              <FileText className="h-4 w-4 mr-2" />
              Run Report ({selectedRuleIds.size} rule{selectedRuleIds.size !== 1 ? 's' : ''})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
