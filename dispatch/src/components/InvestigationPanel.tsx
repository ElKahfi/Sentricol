import { AlertTriangle, User, Link2, FileText, MessageCircle, Share2, ClipboardList, Users } from 'lucide-react'
import { InvestigationCategory } from '@/lib/types'
import { useClickSound } from '@/lib/useClickSound'

interface InvestigationPanelProps {
  investigationList: (Omit<InvestigationCategory, 'id'> & { id: string })[]
  onMakeDecision: () => void
  onCheckboxChange?: (categoryId: string) => void
  onVerify?: () => void
  disabled?: boolean
  attemptLabel?: string
  supportingEvidence?: boolean
  supportingRecords?: { id: string; label: string; detail: string; checked: boolean }[]
  onRecordChange?: (id: string) => void
}

const icons = { profile: User, link: Link2, file: FileText, language: MessageCircle, context: Share2, request: ClipboardList }

export default function InvestigationPanel({ investigationList, onMakeDecision, onCheckboxChange, onVerify, disabled = false, attemptLabel, supportingEvidence = false, supportingRecords, onRecordChange }: InvestigationPanelProps) {
  const playClickSound = useClickSound()
  const checkedCount = investigationList.filter(item => item.checked).length

  return (
    <section className="email-evidence-window metal-frame" aria-label="Investigation list">
      <header className="email-window-heading"><AlertTriangle size={25} className="evidence-alert" aria-hidden="true"/><h2>INVESTIGATION LIST</h2><span className="evidence-counter">{attemptLabel ?? `${checkedCount}/${investigationList.length}`}</span></header>
      <div className="email-evidence-paper paper-surface">
        <div className="email-evidence-list">
          {investigationList.length === 0 ? <p className="email-empty">No email tasks available</p> : investigationList.map(item => {
            const Icon = icons[item.id as keyof typeof icons] ?? FileText
            return <div key={item.id} className={`email-evidence-item ${item.checked ? 'is-selected' : ''}`}>
              <div className="evidence-icon"><Icon size={30} strokeWidth={1.5} aria-hidden="true"/></div>
              <div className="evidence-copy"><h3>{item.label}</h3><p>{item.description}</p>{item.hasEvidence && !supportingEvidence && <span className="evidence-collected">✓ Evidence collected</span>}</div>
              <input type="checkbox" disabled={disabled} aria-label={supportingEvidence ? `Reviewed ${item.label}` : `Use ${item.label} as evidence`} checked={item.checked} onChange={() => { playClickSound(); onCheckboxChange?.(item.id) }} className="email-evidence-checkbox"/>
            </div>
          })}
          {supportingRecords && <div className="email-supporting-records"><h3>SUPPORTING RECORDS</h3><p>Select the records that support your decision. These selections are scored.</p>{supportingRecords.map(record => <label key={record.id} className={`email-supporting-record ${record.checked ? 'is-selected' : ''}`}><span><strong>{record.label}</strong><small>{record.detail}</small></span><input type="checkbox" className="email-evidence-checkbox" disabled={disabled} checked={record.checked} onChange={() => { playClickSound(); onRecordChange?.(record.id) }} /></label>)}</div>}
        </div>
        <div className="email-evidence-actions">
          {onVerify && <button onClick={() => { playClickSound(); onVerify() }} className="email-contact-button"><Users size={23} aria-hidden="true"/>Contact People</button>}
          <div className="email-evidence-summary"><h3>Evidence Collected</h3><p>{supportingEvidence ? 'Check the investigation areas, then select supporting records above. Reading does not spend a submission.' : 'Review the clues you’ve found to build your case.'}</p></div>
          <button disabled={disabled} onClick={() => { playClickSound(); onMakeDecision() }} className="console-button email-decision-button">Make a Decision</button>
        </div>
      </div>
    </section>
  )
}
