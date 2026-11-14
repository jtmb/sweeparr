/** Safe for HTML script raw-text contexts (including application/json). */
export function htmlJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value)
  if (typeof value === 'string' && (/^[\t\r\n]/.test(text) || /^[\s]*[=+@-]/.test(text))) text = "'" + text
  return `"${text.replace(/"/g, '""')}"`
}
