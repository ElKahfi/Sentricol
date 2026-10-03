'use client'
import { useCallback, useEffect, useState } from 'react'

export type DashboardTab='overview'|'employees'|'dispatch'|'protocol'
type Learner={id:string;name:string;email:string;department:string;active:boolean;userId:string|null;
  experience:number;courseExp:number|null;progress:number|null;completedTasks:number;phase:string|null;courseStatus:string|null;
  lastLoginAt:string|null;lastTaskAt:string|null;courseUpdatedAt:string|null;protocolLastSeen:string|null}
type Alert={id:string;name:string;email:string;department:string;severity:string;detectedAt:string;acknowledgedAt:string|null}
type Snapshot={employees:Learner[];alerts:Alert[];risk:{total:number;open:number;last24Hours:number};updatedAt:string}
const date=(value:string|null)=>value?new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'No activity yet'
const label=(value:string|null)=>value?.replaceAll('-',' ')||'Not started'
export default function CompanyDashboard({tab,databaseMode,onNavigate,onAddEmployee}:{tab:DashboardTab;databaseMode:boolean;onNavigate:(tab:DashboardTab)=>void;onAddEmployee:()=>void}) {
  const [data,setData]=useState<Snapshot|null>(null)
  const [error,setError]=useState('')
  const [refreshing,setRefreshing]=useState(false)
  const [pending,setPending]=useState('')
  const [search,setSearch]=useState('')
  const [openOnly,setOpenOnly]=useState(true)
  const load=useCallback(async(signal?:AbortSignal)=>{
    setRefreshing(true)
    try {
      const response=await fetch('/api/monitoring',{cache:'no-store',signal})
      const result=await response.json()
      if(!response.ok) throw Error(result.error||'Monitoring is unavailable.')
      if(!signal?.aborted){setData(result);setError('')}
    }catch(error){if(!signal?.aborted)setError(error instanceof Error?error.message:'Monitoring is unavailable.')}
    finally{if(!signal?.aborted)setRefreshing(false)}
  },[])
  useEffect(()=>{
    if(!databaseMode)return
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>
    async function poll(){await load(controller.signal);if(!controller.signal.aborted)timer=setTimeout(poll,30000)}
    void poll();return()=>{controller.abort();clearTimeout(timer)}
  },[databaseMode,load])
  async function acknowledge(id:string){
    if(pending)return
    setPending(id)
    try{
      const response=await fetch('/api/monitoring',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'acknowledge',id})})
      const result=await response.json();if(!response.ok)throw Error(result.error||'Could not acknowledge alert.')
      await load()
    }catch(error){setError(error instanceof Error?error.message:'Could not acknowledge alert.')}
    finally{setPending('')}
  }
  if(tab==='employees')return null
  if(!databaseMode)return <section className="panel dashboard-empty"><span className="eyebrow">PREVIEW WORKSPACE</span><h2>Connect your company to begin monitoring.</h2><p>Employee management is available in this preview. Live Dispatch progress and Protocol alerts appear when Deployment uses your company database.</p><button className="button" onClick={()=>onNavigate('employees')}>MANAGE EMPLOYEES →</button></section>
  const employees=data?.employees??[]
  const online=(person:Learner)=>person.active&&person.protocolLastSeen&&Date.now()-Date.parse(person.protocolLastSeen)<120000
  const matching=employees.filter(e=>`${e.name} ${e.email} ${e.department}`.toLowerCase().includes(search.toLowerCase()))
  const alerts=(data?.alerts??[]).filter(a=>(!openOnly||!a.acknowledgedAt)&&`${a.name} ${a.email} ${a.department}`.toLowerCase().includes(search.toLowerCase()))
  const enrolled=employees.filter(e=>e.progress!==null)
  const mean=enrolled.length?Math.round(enrolled.reduce((s,e)=>s+(e.progress??0),0)/enrolled.length):null
  const trainingRows=(list:Learner[])=><div className="monitor-table-wrap"><table className="monitor-table"><thead><tr><th>EMPLOYEE</th><th>TRAINING</th><th>PROGRESS</th><th>TASKS DONE</th><th>LAST ACTIVITY</th></tr></thead><tbody>{list.map(e=><tr key={e.id}><td><strong>{e.name}</strong><small>{e.department}{!e.active?' · Inactive':''}</small></td><td><span className="monitor-label">{e.phase?`${e.phase} stage`:e.userId?'Regular practice':'No Dispatch account'}</span><small>{e.courseStatus?label(e.courseStatus):e.lastLoginAt?'Signed in':'Awaiting first sign-in'}</small></td><td>{e.progress!==null?<><div className="progress-caption"><strong>{Math.round(e.progress)}%</strong><small>{Math.floor(e.courseExp??0)} EXP</small></div><progress max={100} value={e.progress} aria-label={`${e.name} course completion`} /></>:<><strong>{e.experience} EXP</strong><small>Course not active</small></>}</td><td>{e.completedTasks}</td><td>{date([e.lastTaskAt,e.courseUpdatedAt,e.lastLoginAt].filter(Boolean).sort().at(-1)??null)}</td></tr>)}</tbody></table>{!list.length&&<div className="dashboard-empty"><h3>No training activity to show.</h3><p>Add employees and prepare their Dispatch accounts to begin.</p></div>}</div>
  const riskRows=(list:Alert[])=><div className="risk-list">{list.map(a=><article className={`risk-card ${a.acknowledgedAt?'acknowledged':''}`} key={a.id}><span className="risk-marker" aria-hidden="true">!</span><div><div className="risk-card-heading"><strong>{a.name}</strong><span className="risk-severity">{a.severity==='high-risk'?'HIGH RISK':'SUSPICIOUS'}</span></div><p>{a.department} · {a.email}</p><small>Detected {date(a.detectedAt)}</small>{a.acknowledgedAt&&<small>Acknowledged {date(a.acknowledgedAt)}</small>}</div>{a.acknowledgedAt?<span className="ack-status">ACKNOWLEDGED</span>:<button className="button" disabled={Boolean(pending)} onClick={()=>void acknowledge(a.id)}>{pending===a.id?'SAVING…':'ACKNOWLEDGE'}</button>}</article>)}{!list.length&&<div className="dashboard-empty"><span className="empty-mark" aria-hidden="true">[ ✓ ]</span><h3>No {openOnly?'open ':''}risk alerts.</h3><p>Alerts appear here when a linked employee’s Protocol app detects a risky email. An empty list does not confirm that every inbox has been scanned.</p></div>}</div>
  return <div className="company-dashboard">
    <div className="dashboard-toolbar"><div><span className={`live-dot ${error?'offline':''}`} />{error?'MONITORING UNAVAILABLE':data?'COMPANY MONITORING':'LOADING WORKSPACE'}<small>{data?`Updated ${date(data.updatedAt)} · refreshes every 30s`:'Connecting to company records…'}</small></div><button className="button" disabled={refreshing} onClick={()=>void load()}>{refreshing?'REFRESHING…':'↻ REFRESH'}</button></div>
    {error&&<p className="monitor-error" role="alert">{error} {data?'The last successful snapshot is shown below.':''}</p>}
    <div className="dashboard-metrics">
      <article><span>ACTIVE EMPLOYEES</span><strong>{data?employees.filter(e=>e.active).length:'—'}</strong><small>{employees.length} employee records</small></article>
      <article><span>COURSE PROGRESS</span><strong>{mean===null?'—':`${mean}%`}</strong><small>{enrolled.length} enrolled in the four-stage course</small></article>
      <article><span>PROTOCOL ONLINE</span><strong>{data?employees.filter(online).length:'—'}</strong><small>Seen in the last two minutes</small></article>
      <article className={data?.risk.open?'metric-alert':''}><span>OPEN RISK ALERTS</span><strong>{data?.risk.open??'—'}</strong><small>{data?.risk.last24Hours??0} detected in the last 24 hours</small></article>
    </div>
    {tab==='overview'?<>
      <div className="dashboard-section-heading"><div><span className="eyebrow">YOUR PEOPLE / YOUR SECURITY</span><h2>Company overview</h2></div><button className="button primary" onClick={onAddEmployee}>＋ ADD EMPLOYEE</button></div>
      <section className="panel monitoring-panel"><div className="panel-heading"><h2>DISPATCH / TRAINING ACTIVITY</h2><button className="monitor-link" onClick={()=>onNavigate('dispatch')}>VIEW ALL →</button></div>{trainingRows(employees.slice(0,5))}</section>
      <section className="panel monitoring-panel"><div className="panel-heading"><h2>PROTOCOL / RECENT RISK ALERTS</h2><button className="monitor-link" onClick={()=>onNavigate('protocol')}>VIEW ALL →</button></div>{riskRows((data?.alerts??[]).filter(a=>!a.acknowledgedAt).slice(0,3))}</section>
    </>:tab==='dispatch'?<section className="panel monitoring-panel"><div className="panel-heading"><h2>DISPATCH / EMPLOYEE PROGRESS</h2><span>{employees.length} EMPLOYEES</span></div><p className="monitor-description">Saved course completion, experience, and completed tasks. Regular practice shows EXP; the four-stage course also shows completion percentage.</p><label className="monitor-search"><span className="sr-only">Search training progress</span><input placeholder="Search employee, email or department…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{trainingRows(matching)}</section>:<>
      <section className="panel monitoring-panel"><div className="panel-heading"><h2>PROTOCOL / RISK MONITOR</h2><span>{data?.risk.total??0} RECORDED ALERTS</span></div><p className="monitor-description">Risk metadata from employee Protocol apps. Acknowledge an alert after following up; this records your review and does not mark the email safe.</p><div className="monitor-filters"><label className="monitor-search"><span className="sr-only">Search risk alerts</span><input placeholder="Search employee, email or department…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="monitor-toggle"><input type="checkbox" checked={openOnly} onChange={e=>setOpenOnly(e.target.checked)}/>OPEN ONLY</label></div>{riskRows(alerts)}<p className="monitor-footnote">Showing up to 100 alerts, with unacknowledged alerts first. Email contents stay outside this dashboard.</p></section>
      <section className="panel monitoring-panel"><div className="panel-heading"><h2>EMPLOYEE CONNECTIONS</h2><span>GMAIL → PROTOCOL → DEPLOYMENT</span></div><div className="monitor-table-wrap"><table className="monitor-table"><thead><tr><th>EMPLOYEE</th><th>WORK EMAIL</th><th>PROTOCOL STATUS</th><th>LAST SEEN</th></tr></thead><tbody>{matching.map(e=><tr key={e.id}><td><strong>{e.name}</strong><small>{e.department}</small></td><td>{e.email}</td><td><span className={`connection-status ${online(e)?'online':''}`}>{online(e)?'Online':e.protocolLastSeen?'Offline':'Not connected'}</span></td><td>{date(e.protocolLastSeen)}</td></tr>)}</tbody></table></div><p className="monitor-footnote">Employees connect the same Gmail address registered in Deployment. Protocol reports while open and signed in.</p></section>
    </>}
  </div>
}
