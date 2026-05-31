'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, RefreshCw, Library } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface LibraryEntry {
  key: string
  title: string
}

interface Rule {
  id: string
  name: string
  libraryId?: string | null
  enabled: boolean
  minAgeDays: number
  maxDaysSinceWatched?: number | null
  protectNeverWatched: boolean
  protectInProgress: boolean
  protectCurrentlyPlaying: boolean
}

const DEFAULT_FORM: Omit<Rule, 'id'> = {
  name: '',
  libraryId: null,
  enabled: true,
  minAgeDays: 30,
  maxDaysSinceWatched: 90,
  protectNeverWatched: false,
  protectInProgress: true,
  protectCurrentlyPlaying: true,
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  const loadRules = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rules')
      setRules(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
    fetch('/api/plex/libraries')
      .then((r) => r.json())
      .then((d: { libraries?: LibraryEntry[] }) => {
        if (Array.isArray(d.libraries)) setLibraries(d.libraries)
      })
      .catch(() => {})
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setOpen(true)
  }

  const openEdit = (rule: Rule) => {
    setEditing(rule)
    setForm({
      name: rule.name,
      libraryId: rule.libraryId,
      enabled: rule.enabled,
      minAgeDays: rule.minAgeDays,
      maxDaysSinceWatched: rule.maxDaysSinceWatched,
      protectNeverWatched: rule.protectNeverWatched,
      protectInProgress: rule.protectInProgress,
      protectCurrentlyPlaying: rule.protectCurrentlyPlaying,
    })
    setOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await fetch(`/api/rules/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      setOpen(false)
      await loadRules()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return
    await fetch(`/api/rules/${id}`, { method: 'DELETE' })
    await loadRules()
  }

  const toggleEnabled = async (rule: Rule) => {
    await fetch(`/api/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    })
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cleanup Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define criteria for media eligible for deletion
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Rule' : 'New Cleanup Rule'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Rule Name</label>
                <Input
                  placeholder="e.g. Old Watched Movies"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Library className="h-3.5 w-3.5" /> Library
                </label>
                <Select
                  value={form.libraryId ?? '_all'}
                  onValueChange={(v) => setForm((p) => ({ ...p, libraryId: v === '_all' ? null : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Libraries</SelectItem>
                    {libraries.map((lib) => (
                      <SelectItem key={lib.key} value={lib.key}>{lib.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Restrict this rule to a specific library</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Min Age (days)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.minAgeDays}
                  onChange={(e) => setForm((p) => ({ ...p, minAgeDays: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Media added less than this many days ago is protected</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Max Days Since Watched</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Leave empty for no limit"
                  value={form.maxDaysSinceWatched ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, maxDaysSinceWatched: e.target.value ? Number(e.target.value) : null }))}
                />
                <p className="text-xs text-muted-foreground">Media last watched more than this many days ago is a candidate</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Protect Never Watched</p>
                  <p className="text-xs text-muted-foreground">Don&apos;t flag items that have never been watched</p>
                </div>
                <Switch
                  checked={form.protectNeverWatched}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, protectNeverWatched: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Protect In-Progress</p>
                  <p className="text-xs text-muted-foreground">Don&apos;t flag items currently being watched</p>
                </div>
                <Switch
                  checked={form.protectInProgress}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, protectInProgress: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Protect Currently Playing</p>
                  <p className="text-xs text-muted-foreground">Don&apos;t flag items with an active Plex session</p>
                </div>
                <Switch
                  checked={form.protectCurrentlyPlaying}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, protectCurrentlyPlaying: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Enabled</p>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name}>
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                {editing ? 'Save Changes' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No rules configured yet</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create First Rule</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
              <Switch checked={rule.enabled} onCheckedChange={() => toggleEnabled(rule)} />
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${!rule.enabled ? 'text-muted-foreground' : ''}`}>
                  {rule.name}
                  {rule.libraryId && (() => {
                    const lib = libraries.find((l) => l.key === rule.libraryId || l.title === rule.libraryId)
                    return lib ? (
                      <span className="ml-2 text-xs font-normal text-primary/80 bg-primary/10 rounded px-1.5 py-0.5">
                        {lib.title}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                        {rule.libraryId}
                      </span>
                    )
                  })()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Min age: {rule.minAgeDays}d
                  {rule.maxDaysSinceWatched ? ` · Stale after: ${rule.maxDaysSinceWatched}d` : ''}
                  {rule.protectNeverWatched ? ' · Protects unwatched' : ''}
                  {rule.protectInProgress ? ' · Protects in-progress' : ''}
                  {rule.protectCurrentlyPlaying ? ' · Protects playing' : ''}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(rule.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
