export type InvestigationId = 'profile' | 'link' | 'file' | 'language' | 'context' | 'request'

export type InvestigationPerformance = Record<InvestigationId, number>

export interface Email {
  id: string
  from: string
  senderDomain: string
  to: string
  subject: string
  body: string
  timestamp: string
  links?: { text: string; url: string }[]
  attachments: Attachment[]
  // Live course emails omit answer keys; legacy preview fixtures may include them.
  isLegitimate?: boolean
  threat?: 'phishing' | 'malware' | 'social-engineering' | 'legitimate'
  workContext?: string
  clues: EmailClues
  redFlags?: string[]
  requiredInvestigationCategories?: InvestigationId[]
  investigationStates?: Partial<Record<InvestigationId, 'suspicious' | 'legitimate' | 'irrelevant'>>
  investigationHints?: [string, string, string]
}

export interface Attachment {
  name: string
  size: number
  type: string
  suspicious: boolean
  details: string
}

export interface EmailClues {
  senderProfile: string
  linkDetails: string[]
  attachmentAnalysis: string
  languageAnalysis: string
  contextAnalysis: string
  requestAnalysis: string
}

export interface InvestigationCategory {
  id: 'profile' | 'link' | 'file' | 'language' | 'context' | 'request'
  label: string
  description: string
  checked: boolean
  hasEvidence: boolean
}

export type TaskType = 'email' | 'password' | 'data-classification'

export interface DispatchItem {
  assignmentId?: string
  attemptId?: string
  caseId?: number
  taskCode?: string
  priority?: 'HIGH' | 'MEDIUM' | 'LOW'
  matchScore?: number
  matchReason?: Record<string, unknown>
  source?: 'database' | 'mock' | 'course'
  courseInfo?: { phase: string; attemptLimit: number; submissionsUsed: number; nextRewardExp: number; recovery: boolean }
  id: string
  type: TaskType
  timestamp: number
  payload: Email | Password | DataClassification
}

export interface GameState {
  graduationProgress: number
  currentTaskType: 'email' | 'password' | 'data-classification'
  currentEmailId: string | null
  currentPasswordId: string | null
  currentDocumentId: string | null
  investigatedCategories: Set<string>
  confidenceLevel?: number
  decision: 'legitimate' | 'phishing' | null
  day: number
  todaysTasksCompleted: number
  tasksGeneratedToday: number
  dispatchQueue: DispatchItem[]
}

export interface VerificationContact {
  id: string
  name: string
  role: string
  canHelp: string[]
}

export interface PasswordCharacteristic {
  id: string
  label: string
  description: string
  icon: string
  present: boolean
  checked: boolean
  weight: number
}

export interface Password {
  id: string
  employee: string
  department: string
  submitted: string
  timestamp: string
  characteristics: PasswordCharacteristic[]
  correctDecision: 'approve' | 'revision' | 'reject'
}

export interface DataClassification {
  id: string
  title: string
  from: string
  timestamp: string
  fileType: string
  fileSize: string
  preview: string
  sensitivityIndicators: string[]
  correctClassification: 'public' | 'internal' | 'confidential' | 'restricted'
  shouldShareWith?: string
}
