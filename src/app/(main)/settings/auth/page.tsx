'use client'

import { useState, useEffect, FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'

type AuthState = {
  enabled: boolean
  username: string
  hasUsername: boolean
  hasPassword: boolean
}

export default function AuthSettingsPage() {
  const [auth, setAuth] = useState<AuthState>({ enabled: false, username: '', hasUsername: false, hasPassword: false })
  const [enableSaving, setEnableSaving] = useState(false)
  const [enableSaved, setEnableSaved] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [credError, setCredError] = useState<string | null>(null)
  const [credSaving, setCredSaving] = useState(false)
  const [credSaved, setCredSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings/auth')
      .then((r) => r.json())
      .then((d: AuthState) => {
        setAuth(d)
        setUsername(d.username ?? '')
      })
      .catch(() => {})
  }, [])

  const toggleEnabled = async (enabled: boolean) => {
    setEnableSaving(true)
    setEnableSaved(false)
    setEnableError(null)
    const res = await fetch('/api/settings/auth', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (res.ok) {
      setAuth((p) => ({ ...p, enabled }))
    } else {
      const data = (await res.json()) as { error?: string }
      setEnableError(data.error ?? 'Failed to update auth setting')
    }
    setEnableSaving(false)
    if (res.ok) {
      setEnableSaved(true)
      setTimeout(() => setEnableSaved(false), 3000)
    }
  }

  const handleCredentialsSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setCredError(null)

    const nextUsername = username.trim()
    if (!nextUsername) {
      setCredError('Username cannot be empty')
      return
    }
    if (nextUsername.length < 3) {
      setCredError('Username must be at least 3 characters')
      return
    }

    // If password is provided, enforce confirmation + minimum length.
    // If password is blank and one already exists, keep current password.
    if (newPassword || confirmPassword) {
      if (newPassword.length < 8) {
        setCredError('Password must be at least 8 characters')
        return
      }
      if (newPassword !== confirmPassword) {
        setCredError('Passwords do not match')
        return
      }
    } else if (!auth.hasPassword) {
      setCredError('Set a password before enabling authentication')
      return
    }

    setCredSaving(true)
    const res = await fetch('/api/settings/auth', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: nextUsername,
        ...(newPassword ? { password: newPassword } : {}),
      }),
    })
    setCredSaving(false)

    if (res.ok) {
      setAuth((p) => ({ ...p, username: nextUsername, hasUsername: true, hasPassword: p.hasPassword || !!newPassword }))
      setUsername(nextUsername)
      setNewPassword('')
      setConfirmPassword('')
      setCredSaved(true)
      setTimeout(() => setCredSaved(false), 3000)
    } else {
      const data = (await res.json()) as { error?: string }
      setCredError(data.error ?? 'Failed to save credentials')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Authentication
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Protect the UI with a single password
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enable Password Protection</CardTitle>
          <CardDescription>
            When enabled, a username and password are required to access the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Require password</p>
              {(!auth.hasUsername || !auth.hasPassword) && (
                <p className="text-xs text-amber-400 mt-0.5">Set a username and password below before enabling</p>
              )}
            </div>
            <Switch
              checked={auth.enabled}
              disabled={(!auth.hasUsername || !auth.hasPassword) && !auth.enabled}
              onCheckedChange={toggleEnabled}
            />
          </div>
          {(enableSaving || enableSaved) && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              {enableSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
              <span className="text-muted-foreground">{enableSaving ? 'Saving…' : 'Saved'}</span>
            </div>
          )}
          {enableError && <p className="mt-2 text-sm text-destructive">{enableError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credentials</CardTitle>
          <CardDescription>
            Set your username and password in one place
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="username">
                Username
              </label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-password">
                {auth.hasPassword ? 'New Password (optional)' : 'Password'}
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={auth.hasPassword ? 'Leave blank to keep current password' : 'Min 8 characters'}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="confirm-password">
                Confirm Password{auth.hasPassword ? ' (if changing)' : ''}
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {credError && <p className="text-sm text-destructive">{credError}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={credSaving || !username.trim()}>
                {credSaving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Credentials
              </Button>
              {credSaved && (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
