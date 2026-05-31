import { PrismaClient } from '@/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL ?? 'file:./dev.db'
  // Strip "file:" prefix to get the file path
  const filePath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), filePath)
  const adapter = new PrismaBetterSqlite3({ url: resolvedPath })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
