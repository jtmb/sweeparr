/**
 * In-process log buffer + event emitter.
 * Scheduler jobs write here; the SSE endpoint streams to the browser.
 * Logs are also written to logs/app.log on disk for persistence across restarts.
 */
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'

// ── File logging ──────────────────────────────────────────────────────────────
const LOG_DIR = path.join(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB — rotate at this size

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  } catch { /* ignore */ }
}

function writeToFile(line: string) {
  try {
    ensureLogDir()
    // Rotate: if file exceeds limit, rename to .old and start fresh
    try {
      const stat = fs.statSync(LOG_FILE)
      if (stat.size > MAX_FILE_BYTES) {
        fs.renameSync(LOG_FILE, LOG_FILE + '.old')
      }
    } catch { /* file doesn't exist yet */ }
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch { /* never let file I/O break the app */ }
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export type LogTag =
  | 'scheduler'
  | 'library-scan'
  | 'library-list-scan'
  | 'cleanup'
  | 'backup'
  | 'poster-backfill'
  | 'notifications'
  | 'system'

export interface LogEntry {
  id: number
  timestamp: string // ISO string — safe to serialize
  level: LogLevel
  tag: LogTag
  message: string
}

const MAX_BUFFER = 500

// ── Singleton state on globalThis — survives module hot-reloads in Next.js dev
// mode and is shared across all route handlers in the same Node.js process.
// Without this, each route module gets its own EventEmitter instance, so events
// emitted from the scan/backfill routes never reach the SSE log-stream route.
declare const globalThis: typeof global & {
  _appLog?: { buffer: LogEntry[]; emitter: EventEmitter; counter: number }
}

if (!globalThis._appLog) {
  const e = new EventEmitter()
  e.setMaxListeners(50)
  globalThis._appLog = { buffer: [], emitter: e, counter: 0 }
}

const _state = globalThis._appLog

export function appLog(level: LogLevel, tag: LogTag, message: string): void {
  const entry: LogEntry = {
    id: ++_state.counter,
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
  }
  _state.buffer.push(entry)
  if (_state.buffer.length > MAX_BUFFER) _state.buffer.shift()
  _state.emitter.emit('log', entry)

  // Persist to file (timestamp | LEVEL | tag | message)
  const fileLine = `${entry.timestamp} | ${entry.level.toUpperCase().padEnd(5)} | ${entry.tag.padEnd(16)} | ${message}`
  writeToFile(fileLine)

  // Forward to process console
  const prefix = `[${tag}]`
  if (level === 'error') console.error(prefix, message)
  else if (level === 'warn') console.warn(prefix, message)
  else console.log(prefix, message)
}

export function getRecentLogs(limit = MAX_BUFFER): LogEntry[] {
  return _state.buffer.slice(-limit)
}

/** Subscribe to new log entries. Returns an unsubscribe function. */
export function subscribeToLogs(handler: (entry: LogEntry) => void): () => void {
  _state.emitter.on('log', handler)
  return () => _state.emitter.off('log', handler)
}

export function clearLogs(): void {
  _state.buffer.length = 0
}
