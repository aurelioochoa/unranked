import type { NextConfig } from 'next'

const config: NextConfig = {
  // better-sqlite3 is a native module: it must stay external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
}

export default config
