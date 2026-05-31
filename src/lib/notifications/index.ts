import prisma from '@/lib/db/client'
import { formatBytes } from '@/lib/utils'
import axios from 'axios'
import nodemailer from 'nodemailer'
import { generateReportHtml, generateTestReportHtml, generateEmailBodyHtmlForReport, generateEmailBodyHtml } from '@/lib/reports/html-export'

export interface NotificationPayload {
  type: 'cleanup_complete' | 'report_ready' | 'scan_complete' | 'error'
  reportId?: string
  deleted?: number
  failed?: number
  skipped?: number
  freedBytes?: number
  message?: string
}

async function getConfig(type: string): Promise<Record<string, unknown> | null> {
  const row = await prisma.notificationConfig.findUnique({ where: { type } })
  if (!row || !row.enabled) return null
  try {
    return JSON.parse(row.config) as Record<string, unknown>
  } catch {
    return null
  }
}

const EVENT_CFG_KEY: Record<NotificationPayload['type'], string> = {
  cleanup_complete: 'onCleanupComplete',
  report_ready: 'onReportReady',
  scan_complete: 'onScanComplete',
  error: 'onError',
}

async function sendDiscord(cfg: Record<string, unknown>, payload: NotificationPayload, htmlContent?: string) {
  const webhookUrl = cfg.webhookUrl as string
  if (!webhookUrl) return

  // Respect per-event toggles (default enabled if key absent)
  const cfgKey = EVENT_CFG_KEY[payload.type]
  if (cfgKey && cfg[cfgKey] === false) return

  const color = payload.type === 'error' ? 0xff4444 : payload.failed ? 0xf59e0b : 0x4ade80

  const TITLES: Record<NotificationPayload['type'], string> = {
    cleanup_complete: '🧹 Cleanup Complete',
    report_ready: '📋 Cleanup Report Ready',
    scan_complete: '🔍 Library Scan Complete',
    error: '⚠️ Error',
  }

  const fields =
    payload.type === 'error'
      ? [{ name: 'Message', value: payload.message ?? 'Unknown error', inline: false }]
      : payload.type === 'scan_complete'
      ? [{ name: 'Status', value: 'Library scan finished', inline: false }]
      : [
          { name: 'Deleted', value: String(payload.deleted ?? 0), inline: true },
          { name: 'Skipped', value: String(payload.skipped ?? 0), inline: true },
          { name: 'Failed', value: String(payload.failed ?? 0), inline: true },
          { name: 'Space Freed', value: formatBytes(payload.freedBytes ?? 0), inline: true },
        ]

  const embed = {
    title: TITLES[payload.type],
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'Sweeparr' },
  }

  if (htmlContent) {
    // Upload HTML file alongside the embed using multipart/form-data
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ embeds: [embed] }))
    form.append('files[0]', new Blob([htmlContent], { type: 'text/html' }), `report-${payload.reportId ?? 'export'}.html`)
    await axios.post(webhookUrl, form)
  } else {
    await axios.post(webhookUrl, { embeds: [embed] })
  }
}

async function sendSmtp(cfg: Record<string, unknown>, payload: NotificationPayload, attachmentHtml?: string, emailBodyHtml?: string) {
  const { host, port, secure, user, pass, from } = cfg as {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    from: string
  }
  const toRaw = cfg.to as string | string[] | undefined
  const to = Array.isArray(toRaw) ? toRaw.join(', ') : (toRaw ?? '')

  // Respect per-event toggles (default enabled if key absent)
  const cfgKey = EVENT_CFG_KEY[payload.type]
  if (cfgKey && cfg[cfgKey] === false) return

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  const subject =
    payload.type === 'cleanup_complete'
      ? `Sweeparr — Cleanup Complete (${payload.deleted} deleted)`
      : payload.type === 'report_ready'
      ? `Sweeparr — Cleanup Report Ready (${payload.deleted ?? 0} candidates)`
      : 'Sweeparr — Notification'

  const attachments = attachmentHtml
    ? [{ filename: `report-${payload.reportId ?? 'export'}.html`, content: attachmentHtml, contentType: 'text/html' }]
    : []

  const bodyHtml = emailBodyHtml ?? `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px;font-size:18px">${subject}</h2>
      <table cellpadding="4" style="font-size:14px">
        <tr><td style="color:#6b7280">Deleted:</td><td><strong>${payload.deleted ?? 0}</strong></td></tr>
        <tr><td style="color:#6b7280">Skipped:</td><td><strong>${payload.skipped ?? 0}</strong></td></tr>
        <tr><td style="color:#6b7280">Failed:</td><td><strong>${payload.failed ?? 0}</strong></td></tr>
        <tr><td style="color:#6b7280">Space Freed:</td><td><strong>${formatBytes(payload.freedBytes ?? 0)}</strong></td></tr>
      </table>
      ${attachmentHtml ? '<p style="margin-top:16px;font-size:12px;color:#6b7280">Full interactive report attached.</p>' : ''}
    </div>`

  await transporter.sendMail({
    from,
    to,
    subject,
    html: bodyHtml,
    attachments,
  })
}

async function sendApprise(cfg: Record<string, unknown>, payload: NotificationPayload) {
  const url = cfg.url as string
  if (!url) return

  // Respect per-event toggles (default enabled if key absent)
  const cfgKey = EVENT_CFG_KEY[payload.type]
  if (cfgKey && cfg[cfgKey] === false) return

  const title =
    payload.type === 'cleanup_complete' ? 'Cleanup Complete' : 'Cleanup Report Ready'
  const body = `Deleted: ${payload.deleted ?? 0} | Freed: ${formatBytes(payload.freedBytes ?? 0)} | Failed: ${payload.failed ?? 0}`

  await axios.post(url, { title, body })
}

export async function sendNotifications(payload: NotificationPayload) {
  const [discordCfg, smtpCfg, appriseCfg] = await Promise.all([
    getConfig('discord'),
    getConfig('smtp'),
    getConfig('apprise'),
  ])

  // Generate HTML report attachment once if any agent has attachHtmlReport enabled
  const needsHtml =
    payload.reportId &&
    (payload.type === 'cleanup_complete' || payload.type === 'report_ready') &&
    ((discordCfg?.attachHtmlReport === true) ||
      (smtpCfg?.attachHtmlReport === true))

  let htmlContent: string | undefined
  let smtpEmailBody: string | undefined
  if (needsHtml) {
    try {
      htmlContent = await generateReportHtml(payload.reportId!)
    } catch (e) {
      console.error('[notifications] Failed to generate HTML attachment:', e)
    }
  }
  // Always generate email body HTML for SMTP when report is available
  if (smtpCfg && payload.reportId &&
      (payload.type === 'cleanup_complete' || payload.type === 'report_ready')) {
    try {
      smtpEmailBody = await generateEmailBodyHtmlForReport(payload.reportId)
    } catch (e) {
      console.error('[notifications] Failed to generate SMTP email body:', e)
    }
  }

  const discordHtml = discordCfg?.attachHtmlReport === true ? htmlContent : undefined
  const smtpAttachment = smtpCfg?.attachHtmlReport === true ? htmlContent : undefined

  const tasks: Promise<void>[] = []
  if (discordCfg) tasks.push(sendDiscord(discordCfg, payload, discordHtml).catch(console.error))
  if (smtpCfg) tasks.push(sendSmtp(smtpCfg, payload, smtpAttachment, smtpEmailBody).catch(console.error))
  if (appriseCfg) tasks.push(sendApprise(appriseCfg, payload).catch(console.error))

  await Promise.all(tasks)
}

export async function sendTestNotification(
  channel: 'discord' | 'smtp' | 'apprise',
  cfg: Record<string, unknown>,
  withHtml: boolean
): Promise<void> {
  const testPayload: NotificationPayload = {
    type: 'cleanup_complete',
    deleted: 187,
    failed: 4,
    skipped: 59,
    freedBytes: 847_312_640_000,
  }
  // Force all event toggles on so the test always fires
  const testCfg = { ...cfg, onCleanupComplete: true, onReportReady: true, enabled: true }
  const attachmentHtml = withHtml ? generateTestReportHtml() : undefined

  // Generate fake items for inline email body
  const TITLES = ['Breaking Bad', 'Game of Thrones', 'The Mandalorian', 'Stranger Things', 'The Boys']
  const fakeItems = Array.from({ length: 5 }, (_, i) => ({
    title: TITLES[i], year: 2022 + i, mediaType: i % 2 === 0 ? 'movie' : 'show',
    fileSizeBytes: [22_400_000_000, 14_300_000_000, 8_800_000_000, 4_500_000_000, 1_800_000_000][i],
    status: 'deleted', errorMessage: null, reasons: 'STALE_WATCHED', lastWatchedAt: '2024-06-01T00:00:00Z',
  }))
  const testEmailBody = withHtml
    ? generateEmailBodyHtml(fakeItems, { generatedAt: new Date(), status: 'TEST', totalItems: 250 }, true)
    : undefined

  if (channel === 'discord') await sendDiscord(testCfg, testPayload, attachmentHtml)
  else if (channel === 'smtp') await sendSmtp(testCfg, testPayload, attachmentHtml, testEmailBody)
  else if (channel === 'apprise') await sendApprise(testCfg, testPayload)
}
