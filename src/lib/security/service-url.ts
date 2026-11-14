export function serviceUrl(base: string): URL {
  const url = new URL(base)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid service URL')
  }
  return url
}

export function imageUrl(base: string, input: string): URL {
  const trusted = serviceUrl(base)
  // Accept only paths: no caller-supplied authority, including encoded tricks.
  if (!input.startsWith('/') || input.startsWith('//') || /[\\\u0000-\u0020]/.test(input)) throw new Error('Image path required')
  const url = new URL(input, trusted)
  if (url.origin !== trusted.origin || url.username || url.password) throw new Error('Invalid image origin')
  return url
}
