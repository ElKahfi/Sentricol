import 'server-only'
import { cookies } from 'next/headers'
import { compare, hash } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getDatabase } from './db'
import { SESSION_COOKIE, sessionIdentity } from './auth'
export type Player = { userId: string; userCode: string; version: number; email: string; name: string; company: string; department: string; rank: string }
type Account = Player & { password_hash: string }
const select = `SELECT u.user_id::text AS "userId",u.user_code AS "userCode",u.auth_version AS version,u.email,u.password_hash,
 e.full_name AS name,c.company_name AS company,d.department_name AS department,COALESCE(r.rank_name,'Staff') AS rank
 FROM users u JOIN employees e USING(employee_id) JOIN departments d USING(department_id)
 JOIN companies c USING(company_id) LEFT JOIN ranks r USING(rank_id) WHERE u.role='player' AND e.is_active=true`
function publicPlayer(account: Account): Player { const {password_hash: _, ...player} = account; return player }
const dummyHash = hash(randomUUID(),12)
export async function loginPlayer(identifier: string, password: string): Promise<Player | null> {
  const result = await getDatabase().query<Account>(select+' AND (lower(u.email)=$1 OR lower(u.username)=$1) LIMIT 2',[identifier.trim().toLowerCase()])
  const account = result.rows.length===1 ? result.rows[0] : undefined
  const matches = await compare(password,account?.password_hash ?? await dummyHash)
  if (!account || !matches) return null
  const updated = await getDatabase().query('UPDATE users SET last_login_at=now() WHERE user_id=$1 AND auth_version=$2 RETURNING user_id',[account.userId,account.version])
  return updated.rowCount ? publicPlayer(account) : null
}
// The original local demo used admin / 123. Keep that shortcut confined to the
// seeded player in development; company administrators never become players.
export async function loginLocalDemoPlayer(): Promise<Player | null> {
  if (process.env.NODE_ENV !== 'development' || process.env.DISPATCH_LOCAL_ADMIN_TOOLS !== 'true') return null
  const result = await getDatabase().query<Account>(select+" AND u.user_code='usr_0001' LIMIT 1")
  const account = result.rows[0]
  if (!account) return null
  await getDatabase().query('UPDATE users SET last_login_at=now() WHERE user_id=$1',[account.userId])
  return publicPlayer(account)
}
export async function playerForToken(token: string | undefined): Promise<Player | null> {
  const identity = sessionIdentity(token)
  if (!identity) return null
  const result = await getDatabase().query<Account>(select+' AND u.user_id=$1 AND u.auth_version=$2',[identity.userId,identity.version])
  return result.rows[0] ? publicPlayer(result.rows[0]) : null
}
export async function currentPlayer() { return playerForToken((await cookies()).get(SESSION_COOKIE)?.value) }
export async function localAdminPlayer() {
  if (process.env.NODE_ENV !== 'development' || process.env.DISPATCH_LOCAL_ADMIN_TOOLS !== 'true') return null
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const identity = sessionIdentity(token)
  if (!identity?.localAdminTools) return null
  const player = await playerForToken(token)
  return player?.userCode === 'usr_0001' ? player : null
}
export async function changePassword(player: Player, current: string, next: string) {
  const result = await getDatabase().query<Account>(select+' AND u.user_id=$1 AND u.auth_version=$2',[player.userId,player.version])
  const account = result.rows[0]
  if (!account || !await compare(current,account.password_hash)) return null
  const updated = await getDatabase().query<{auth_version:number}>(`UPDATE users SET password_hash=$1,auth_version=auth_version+1 WHERE user_id=$2 AND auth_version=$3 RETURNING auth_version`,[await hash(next,12),player.userId,player.version])
  return updated.rows[0] ? {...player,version:updated.rows[0].auth_version} : null
}
