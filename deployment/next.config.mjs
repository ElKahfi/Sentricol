import { fileURLToPath } from 'node:url'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'
const root = fileURLToPath(new URL('.', import.meta.url))
export default phase => ({
  turbopack: { root },
  outputFileTracingRoot: root,
  // Keep production verification from replacing the running dev server's manifests.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
})
