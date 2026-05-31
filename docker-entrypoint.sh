#!/bin/sh
set -e

# Run Prisma migrations on startup
echo "Running database migrations..."
node -e "
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
" 2>/dev/null || true

node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma --url "$DATABASE_URL" 2>/dev/null || \
  node ./node_modules/prisma/build/index.js db push --schema ./prisma/schema.prisma --url "$DATABASE_URL" 2>/dev/null || \
  echo "Migration skipped (DB may already be up to date)"

echo "Starting Sweeparr..."
exec node server.js
