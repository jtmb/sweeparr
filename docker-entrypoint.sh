#!/bin/sh
set -e

# Run Prisma migrations on startup
echo "Running database migrations..."
node ./node_modules/prisma/build/index.js migrate deploy --config ./prisma.config.ts

echo "Starting Sweeparr..."
exec node server.js
