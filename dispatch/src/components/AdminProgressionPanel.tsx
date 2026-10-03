'use client'

import { useEffect, useState } from 'react'

type Phase = 'easy' | 'normal' | 'hard' | 'master'
type PanelData = {
  active: boolean
  config: { targetMinutes: number; recoveryAllowance: number; phases: Record<Phase, string[]> }
  course: null | { phase: Phase; progress: number; exp: number; status: string; pendingEvent?: string | null }
}
type ReviewCase = { key:string; phase:Phase; objective:string; subject:string; from:string; body:string;
  evidence:{id:string;label:string;detail:string}[]; decision:string; explanation:string }
const phases: Phase[] = ['easy', 'normal', 'hard', 'master']

export default function AdminProgressionPanel() {
  const [data, setData] = useState<PanelData | null>(null)
  const [minutes, setMinutes] = useState(30)
  const [recovery, setRecovery] = useState(8)
  const [objectives, setObjectives] = useState<Record<Phase, string>>({easy:'',normal:'',hard:'',master:''})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reviews, setReviews] = useState<ReviewCase[]>([])
  async function load() {
    const response = await fetch('/api/admin/progression', {cache:'no-store'})
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not load progression.')
    const next = result as PanelData
    setData(next); setMinutes(next.config.targetMinutes); setRecovery(next.config.recoveryAllowance)
    setObjectives(Object.fromEntries(phases.map(phase => [phase,next.config.phases[phase].join(', ')])) as Record<Phase,string>)
    const reviewResponse = await fetch('/api/admin/course-review', {cache:'no-store'})
    if (reviewResponse.ok) setReviews((await reviewResponse.json()).cases ?? [])
  }
  async function review(key:string, action:'approve'|'reject') {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/course-review', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,action})})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save the review.')
      setReviews(previous => previous.filter(item => item.key !== key))
      setNotice(action === 'approve' ? 'Case approved. The learner can resume the course.' : 'Case rejected. Another case will be generated when the course resumes.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the review.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load().catch(error => setError(error.message)) }, [])
  async function action(name: string) {
    if (busy) return
    if (name === 'reset' && !window.confirm('Reset this demo learner’s course EXP and regular progress? Completed task history stays recorded.')) return
    if (name === 'configure' && data?.course?.exp && !window.confirm('Saving a new course plan restarts this demo learner’s four-stage course at 0 EXP. Continue?')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = name === 'configure' ? {
        action:name, targetMinutes:minutes, recoveryAllowance:recovery,
        phases:Object.fromEntries(phases.map(phase => [phase,objectives[phase].split(',').map(tag => tag.trim()).filter(Boolean)])),
      } : {action:name}
      const response = await fetch('/api/admin/progression', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update progression.')
      setData(result as PanelData)
      try {
        sessionStorage.removeItem('sentri-email-course-pending-v1')
        if (name === 'reset' || name === 'configure') sessionStorage.removeItem('sentri-day-v1-usr_0001')
      } catch { /* Server state remains authoritative if browser storage is unavailable. */ }
      setNotice('Saved. Reloading the dispatch console…')
      window.location.reload()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not update progression.') }
    finally { setBusy(false) }
  }
  if (!data) return <div className="admin-progression"><h3>Admin panel</h3><p>{error || 'Loading progression…'}</p></div>
  return <div className="admin-progression">
    <span className="settings-section-code">04 / LOCAL ADMIN</span>
    <h3>Progression controls</h3>
    <p>Demo learner only. These controls change the saved four-stage email course.</p>
    <div className="admin-progress-status"><strong>{data.active ? `${data.course?.phase.toUpperCase()} · ${data.course?.status.toUpperCase()}` : 'COURSE INACTIVE'}</strong><span>{data.course ? `${Math.round(data.course.progress)}% · ${Math.floor(data.course.exp)} / 1,000 EXP` : 'Regular mixed practice is active'}</span>{data.course?.pendingEvent && <span>{data.course.pendingEvent.toUpperCase()} waiting</span>}</div>
    {!data.active ? <button className="console-button" disabled={busy} onClick={() => void action('activate')}>ACTIVATE FOUR-STAGE COURSE</button> : <>
      <div className="admin-progress-actions"><button className="console-button" disabled={busy || data.course?.status === 'graduated' || Boolean(data.course?.pendingEvent)} onClick={() => void action('skip-difficulty')}>SKIP DIFFICULTY</button><button className="console-button" disabled={busy || !data.course?.pendingEvent} onClick={() => void action('skip-event')}>SKIP EVENT</button><button className="console-button" disabled={busy} onClick={() => void action('reset')}>RESET PROGRESSION</button></div>
      <p className="admin-progress-note">Skipping a difficulty awards its 250 EXP for local testing. Events occur after Easy and Hard; skip the pending event to enter the next stage.</p>
      <fieldset className="admin-progress-config"><legend>CONFIGURE PROGRESSION</legend><div className="admin-progress-numbers"><label>PLAN LENGTH (MINUTES)<input type="number" min={5} max={180} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></label><label>RECOVERY CASES<input type="number" min={0} max={80} value={recovery} onChange={event => setRecovery(Number(event.target.value))} /></label></div>{phases.map(phase => <label key={phase}>{phase.toUpperCase()} OBJECTIVES<input value={objectives[phase]} onChange={event => setObjectives(prev => ({...prev,[phase]:event.target.value}))} /></label>)}<small>Use comma-separated knowledge tags. Saving a new plan restarts the four-stage course at 0 EXP.</small><button className="console-button" disabled={busy} onClick={() => void action('configure')}>SAVE COURSE PLAN</button></fieldset>
      <fieldset className="admin-progress-config"><legend>AI CASE REVIEW · HARD / MASTER</legend>
        <small>New AI email cases are created more often in higher stages. Review these before they reach the learner.</small>
        {reviews.length ? reviews.map(item => <article className="admin-review-case" key={item.key}>
          <strong>{item.phase.toUpperCase()} · {item.objective} · {item.subject}</strong>
          <span>{item.from}</span><p>{item.body}</p>
          <details><summary>Inspect evidence and answer</summary>
            <ul>{item.evidence.map(record => <li key={record.id}><strong>{record.label}:</strong> {record.detail}</li>)}</ul>
            <p>Expected decision: {item.decision}. {item.explanation}</p>
          </details>
          <div className="admin-progress-actions"><button className="console-button" disabled={busy} onClick={() => void review(item.key,'approve')}>APPROVE</button><button className="console-button" disabled={busy} onClick={() => void review(item.key,'reject')}>REJECT</button></div>
        </article>) : <p>No cases awaiting review.</p>}
      </fieldset>
    </>}
    {error && <p role="alert" className="admin-progress-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  </div>
}
