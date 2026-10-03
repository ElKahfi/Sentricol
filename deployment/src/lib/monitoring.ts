import 'server-only'
import { database } from './db'
import { AuthError } from './registration'

export async function companyMonitoring(companyId: string) {
  const db = database()
  const courseInstalled = Boolean((await db.query("SELECT to_regclass('email_course_enrollments') AS installed")).rows[0]?.installed)
  const courseFields = courseInstalled ? `ce.state->>'phase' AS phase, ce.state->>'status' AS "courseStatus",
    CASE WHEN ce.enrollment_id IS NOT NULL THEN COALESCE((SELECT SUM((s->>'earnedUnits')::numeric) FROM jsonb_array_elements(ce.state->'slots') s),0)/1000000 END AS "courseExp",
    COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(ce.state->'slots') s,
      jsonb_array_elements(s->'assignments') a WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(a->'submissions') sub WHERE sub->'feedback'->>'terminal'='true')),0)::int AS "courseCompleted",
    ce.updated_at AS "courseUpdatedAt"` : `NULL AS phase, NULL AS "courseStatus", NULL AS "courseExp", 0 AS "courseCompleted", NULL AS "courseUpdatedAt"`
  const employees = await db.query(`SELECT e.employee_id::text AS id, e.full_name AS name, e.work_email AS email,
    d.department_name AS department, e.is_active AS active, u.user_id::text AS "userId", u.last_login_at AS "lastLoginAt",
    COALESCE(p.experience,0) AS experience, p.average_score AS "averageScore", p.updated_at AS "practiceUpdatedAt",
    COALESCE(t.completed,0)::int AS "practiceCompleted", t.last_completed AS "lastTaskAt",
    pc.last_seen_at AS "protocolLastSeen", ${courseFields}
    FROM employees e JOIN departments d USING(department_id)
    LEFT JOIN users u ON u.employee_id=e.employee_id AND u.role='player'
    LEFT JOIN user_progress p ON p.user_id=u.user_id
    LEFT JOIN LATERAL (SELECT COUNT(*) AS completed, MAX(completed_at) AS last_completed FROM task_assignments
      WHERE user_id=u.user_id AND status='completed') t ON true
    LEFT JOIN protocol_connections pc ON pc.employee_id=e.employee_id AND pc.company_id=d.company_id
    ${courseInstalled ? 'LEFT JOIN email_course_enrollments ce ON ce.user_id=u.user_id AND ce.company_id=d.company_id' : ''}
    WHERE d.company_id=$1 AND NOT EXISTS(SELECT 1 FROM users admin WHERE admin.employee_id=e.employee_id AND admin.role='admin')
    ORDER BY e.full_name,e.employee_id`, [companyId])
  const [alerts, totals] = await Promise.all([
    db.query(`SELECT a.alert_id::text AS id,e.full_name AS name,e.work_email AS email,d.department_name AS department,
      a.employee_id::text AS "employeeId",a.severity,a.detected_at AS "detectedAt",a.acknowledged_at AS "acknowledgedAt"
      FROM protocol_risk_alerts a JOIN employees e USING(employee_id) JOIN departments d USING(department_id)
      WHERE a.company_id=$1 AND d.company_id=$1 ORDER BY (a.acknowledged_at IS NULL) DESC,a.detected_at DESC LIMIT 100`,[companyId]),
    db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE a.acknowledged_at IS NULL)::int AS open,
      COUNT(*) FILTER(WHERE a.detected_at>=now()-interval '24 hours')::int AS "last24Hours"
      FROM protocol_risk_alerts a JOIN employees e USING(employee_id) JOIN departments d USING(department_id)
      WHERE a.company_id=$1 AND d.company_id=$1`,[companyId]),
  ])
  return {employees:employees.rows.map(e => ({...e, experience:Number(e.experience), courseExp:e.courseExp === null ? null : Number(e.courseExp),
    progress:e.courseExp === null ? null : Math.min(100,Number(e.courseExp)/10),
    completedTasks:e.practiceCompleted+e.courseCompleted})), alerts:alerts.rows, risk:totals.rows[0], updatedAt:new Date().toISOString()}
}
export async function acknowledgeAlert(companyId:string, adminId:string, id:unknown) {
  if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) throw new AuthError('Select a valid alert.')
  const result = await database().query(`UPDATE protocol_risk_alerts a SET acknowledged_at=COALESCE(a.acknowledged_at,now()),
    acknowledged_by=COALESCE(a.acknowledged_by,$3) FROM employees e JOIN departments d USING(department_id)
    WHERE a.alert_id=$1 AND a.company_id=$2 AND a.employee_id=e.employee_id AND d.company_id=$2 RETURNING a.alert_id`,[id,companyId,adminId])
  if (!result.rowCount) throw new AuthError('Alert not found in your company.',404)
}
