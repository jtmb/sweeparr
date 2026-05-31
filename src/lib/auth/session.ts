import { SignJWT, jwtVerify } from 'jose'

const EXPIRY_DAYS = 7

function toKey(secret: string) {
  return new TextEncoder().encode(secret)
}

export async function createSession(secretKey: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  const token = await new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(toKey(secretKey))
  return { token, expiresAt }
}

export async function verifySession(token: string, secretKey: string): Promise<boolean> {
  try {
    await jwtVerify(token, toKey(secretKey), { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}
