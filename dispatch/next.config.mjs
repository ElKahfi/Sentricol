import { fileURLToPath } from 'node:url'
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: fileURLToPath(new URL('..', import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
  outputFileTracingIncludes: { '/api/chat': ['./py/sentri.py'] },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
