/** Public liveness only: no configuration, database, or integration access. */
export async function GET() {
  return Response.json({ ok: true })
}
