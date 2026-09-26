import 'server-only'
import { randomUUID } from 'node:crypto'
import { hash } from 'bcryptjs'
import { database, transaction } from './db'
import { AuthError } from './registration'
import { employeeError, type Employee } from './employees'
import type { PoolClient } from 'pg'

const listing = `SELECT e.employee_id::text AS id, e.full_name AS name, e.work_email AS email,
 COALESCE(e.personnel_number,e.employee_code) AS "employeeId", d.department_name AS department,
 COALESCE(r.rank_name,'Staff') AS rank, COALESCE(e.position_title,'') AS title, e.is_active AS active,
 CASE WHEN u.user_id IS NULL THEN 'Not sent' WHEN u.last_login_at IS NULL THEN 'Pending' ELSE 'Accepted' END AS invitation
 FROM employees e JOIN departments d USING(department_id) LEFT JOIN ranks r USING(rank_id)
 LEFT JOIN users u USING(employee_id) WHERE d.company_id=$1 AND (u.role IS NULL OR u.role='player')`
export async function listEmployees(companyId: string, client: Pick<PoolClient, 'query'> = database()) {
  return (await client.query<Employee>(listing + ' ORDER BY e.employee_id', [companyId])).rows
}
export function validateEmployee(value: unknown): Employee {
  if (!value || typeof value !== 'object') throw new AuthError('Invalid employee record.')
  const e = value as Employee
  for (const [key, limit] of Object.entries({ name: 120, email: 150, employeeId: 80, department: 100, title: 100, rank: 20 })) {
    const v = e[key as keyof Employee]
    if (typeof v !== 'string' || !v.trim() || v.trim().length > limit) throw new AuthError(`Please enter a valid ${key} (up to ${limit} characters).`)
  }
  if (typeof e.active !== 'boolean' || (e.id && !/^\d+$/.test(e.id))) throw new AuthError('Invalid employee record.')
  const clean = { ...e, id: e.id || '', name: e.name.trim(), email: e.email.trim().toLowerCase(), employeeId: e.employeeId.trim(), department: e.department.trim(), title: e.title.trim() }
  const problem = employeeError(clean, [])
  if (problem) throw new AuthError(problem)
  return clean
}
export async function saveEmployees(companyId: string, values: unknown[]) {
  if (!values.length || values.length > 2000) throw new AuthError('Provide between 1 and 2,000 employees.')
  const entries = values.map(validateEmployee)
  try {
    return await transaction(async client => {
      await client.query('SELECT company_id FROM companies WHERE company_id=$1 FOR UPDATE', [companyId])
      const existing = await listEmployees(companyId, client)
      // Sorted locks also coordinate with admin registration in another company.
      for (const email of [...new Set(entries.map(e => e.email))].sort()) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [email])
      for (const e of entries) {
        const previous = existing.find(p => p.id === e.id)
        if (e.id && !previous) throw new AuthError('Employee not found in your company.', 404)
        const problem = employeeError(e, existing)
        if (problem) throw new AuthError(problem, 409)
        const duplicate = await client.query(`SELECT 1 FROM employees WHERE lower(work_email)=$1 AND employee_id <> $2
          UNION ALL SELECT 1 FROM users WHERE lower(email)=$1 AND employee_id IS DISTINCT FROM $2 LIMIT 1`, [e.email, e.id || 0])
        if (duplicate.rowCount) throw new AuthError('This work email is already registered.', 409)
        let department = await client.query('SELECT department_id FROM departments WHERE company_id=$1 AND lower(department_name)=lower($2) LIMIT 1', [companyId, e.department])
        if (!department.rowCount) department = await client.query('INSERT INTO departments(company_id,department_code,department_name) VALUES($1,$2,$3) RETURNING department_id', [companyId, `dep_${randomUUID()}`, e.department])
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`sentri-rank:${e.rank}`])
        let rank = await client.query('SELECT rank_id FROM ranks WHERE lower(rank_name)=lower($1) LIMIT 1', [e.rank])
        if (!rank.rowCount) rank = await client.query('INSERT INTO ranks(rank_code,rank_name,seniority_level) VALUES($1,$2,$3) RETURNING rank_id', [`rank_${randomUUID()}`, e.rank, {Staff:1,Manager:2,Executive:3}[e.rank]])
        const params = [department.rows[0].department_id, rank.rows[0].rank_id, e.name, e.title, e.email, e.active, e.employeeId]
        if (previous) {
          await client.query('UPDATE employees SET department_id=$1,rank_id=$2,full_name=$3,position_title=$4,work_email=$5,is_active=$6,personnel_number=$7 WHERE employee_id=$8', [...params,e.id])
          await client.query('UPDATE users SET email=$1, auth_version=auth_version+$2 WHERE employee_id=$3', [e.email, previous.email !== e.email || previous.active !== e.active ? 1 : 0,e.id])
          existing.splice(existing.indexOf(previous),1,e)
        } else {
          const inserted = await client.query('INSERT INTO employees(department_id,rank_id,full_name,position_title,work_email,is_active,personnel_number,employee_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING employee_id', [...params,`emp_${randomUUID()}`])
          existing.push({...e,id:String(inserted.rows[0].employee_id)})
        }
      }
      return listEmployees(companyId, client)
    })
  } catch (error) {
    if ((error as {code?:string}).code === '23505') throw new AuthError('An employee with these details already exists.',409)
    throw error
  }
}
export async function inviteEmployees(companyId: string, ids: unknown) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) throw new AuthError('Select valid employees.')
  return transaction(async client => {
    await client.query('SELECT company_id FROM companies WHERE company_id=$1 FOR UPDATE', [companyId])
    const employees = await listEmployees(companyId, client)
    const selected = [...new Set(ids)] as string[]
    if (selected.some(id => !employees.some(e => e.id === id && e.active))) throw new AuthError('Only active employees in your company can be invited.',403)
    let created = 0
    for (const id of selected) {
      const employee = employees.find(e => e.id===id)!
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [employee.email])
      // Existing accounts keep their password and progress when invited again.
      let user = await client.query('SELECT user_id FROM users WHERE employee_id=$1', [id])
      if (!user.rowCount) {
        const duplicate = await client.query('SELECT 1 FROM users WHERE lower(email)=$1', [employee.email])
        if (duplicate.rowCount) throw new AuthError('This work email is already registered.',409)
        user = await client.query(`INSERT INTO users(user_code,employee_id,username,email,password_hash,role) VALUES($1,$2,$3,$4,$5,'player') RETURNING user_id`, [`usr_${randomUUID()}`,id,`usr_${randomUUID()}`,employee.email,await hash('123',12)])
        created++
      }
      await client.query('INSERT INTO user_progress(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[user.rows[0].user_id])
      await client.query('INSERT INTO user_statistics(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[user.rows[0].user_id])
      // Give every new player a complete baseline profile. Attempts later update
      // only the tags tested by that attempt.
      await client.query(
        `INSERT INTO user_skill_profiles (user_id, tag_id, ability_score)
         SELECT $1, tag_id, 10
         FROM tags
         WHERE is_active = true
         ON CONFLICT (user_id, tag_id) DO NOTHING`,
        [user.rows[0].user_id],
      )
    }
    return { employees: await listEmployees(companyId, client), created }
  })
}
