export async function boundedJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  if (!request.body) throw new Error('JSON body required')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.length
    if (bytes > maxBytes) { await reader.cancel(); throw new Error('JSON body too large') }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
