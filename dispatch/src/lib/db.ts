import 'server-only'

import { Pool, PoolClient, QueryResultRow } from 'pg'

const globalForDatabase = globalThis as unknown as { sentricolPool?: Pool }

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

export function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }

  const pool =
    globalForDatabase.sentricolPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    })

  if (!globalForDatabase.sentricolPool) {
    // Idle connections can close during a database restart or Neon suspension.
    pool.on('error', () => console.error('An idle database connection closed; the pool will reconnect.'))
  }
  globalForDatabase.sentricolPool = pool

  return pool
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDatabase().connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const result = await getDatabase().query<T>(text, values)
  return result.rows[0] ?? null
}
