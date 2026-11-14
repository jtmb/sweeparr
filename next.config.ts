import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.SWEEPARR_BUILD_DIR ?? '.next',
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
