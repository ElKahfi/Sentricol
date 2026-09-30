import { fileURLToPath } from 'node:url'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

export default (phase) => ({
  // Next requires the bundler and tracing roots to match in every mode.
  turbopack: { root: fileURLToPath(new URL('..', import.meta.url)) },
  // Keep dev manifests independent from production builds and previews.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  logging: { incomingRequests: false },
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
  outputFileTracingIncludes: {
    '/api/*': ['./python/**/*.py', '../ai-harness/protocol.py', '../ai-harness/runtime/**/*.py', '../ai-harness/instructions/**/*.md', '../ai-harness/schemas/*.json', '../ai-harness/scoring.json'],
  },
  async headers() { return [{ source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Content-Type-Options', value: 'nosniff' }] }] },
})
