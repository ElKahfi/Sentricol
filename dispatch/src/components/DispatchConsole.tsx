'use client'

import { useState, useEffect, useRef } from 'react'
import { useDialogFocus } from '@/lib/useDialogFocus'
import dayjs from 'dayjs'
import { mockEmails, verificationContacts } from '@/lib/mockEmails'
import { mockPasswords } from '@/lib/mockPasswords'
import { mockDataClassifications } from '@/lib/mockDataClassification'
import { GameState, InvestigationCategory, Email, Password, DataClassification } from '@/lib/types'
import { createInitialInvestigationPerformance, selectAdaptiveEmail, getRandomDelay, updateInvestigationPerformance } from '@/lib/gameHelpers'
import { useCorrectAnswerSound } from '@/lib/useCorrectAnswerSound'
import { useWrongAnswerSound } from '@/lib/useWrongAnswerSound'
import { useTaskNotificationSound } from '@/lib/useTaskNotificationSound'
import { useBackgroundMusic } from '@/lib/useBackgroundMusic'
import Header from '@/components/Header'
import CompanyCard from '@/components/CompanyCard'
import TasksPanel from '@/components/TasksPanel'
import SentriPanel from '@/components/SentriPanel'
import SentriChat from '@/components/SentriChat'
import GameIcon from '@/components/GameIcon'
import DispatchQueueView from '@/components/DispatchQueueView'
import TaskDetailsPanel from '@/components/TaskDetailsPanel'
import EmailInvestigation from '@/components/EmailInvestigation'
import InvestigationPanel from '@/components/InvestigationPanel'
import DecisionModal from '@/components/DecisionModal'
import FeedbackModal from '@/components/FeedbackModal'
import PasswordFeedbackModal from '@/components/PasswordFeedbackModal'
import DataClassificationFeedbackModal from '@/components/DataClassificationFeedbackModal'
import PasswordStrengthTask from '@/components/PasswordStrengthTask'
import PasswordDecisionPanel from '@/components/PasswordDecisionPanel'
import DataClassificationTask from '@/components/DataClassificationTask'
import PasswordPolicyPanel from '@/components/PasswordPolicyPanel'
import DataClassificationDetailsPanel from '@/components/DataClassificationDetailsPanel'
import DeskUI from '@/components/DeskUI'
import ContactModal from '@/components/ContactModal'
import SettingsModal from '@/components/SettingsModal'
import { fetchPlayerProfile, requestPersonalizedTask, submitTaskDecision } from '@/lib/sentricolApi'
import { DispatchItem } from '@/lib/types'
import { useEmailCourse } from '@/lib/useEmailCourse'
import CourseFeedbackModal from '@/components/CourseFeedbackModal'
import { TRAINING_CONFIG, regularTaskType } from '@/lib/trainingConfig'

const previewQueue: DispatchItem[] = [
  { id: 'preview-email', type: 'email', priority: 'HIGH', timestamp: 0, payload: { ...mockEmails[0], id: 'preview-email', subject: 'Invoice from “ACME Corp”', from: 'Vendor', timestamp: '09:15' } },
  { id: 'preview-password', type: 'password', priority: 'MEDIUM', timestamp: 0, payload: { ...mockPasswords[0], id: 'preview-password', employee: 'System', timestamp: '09:10' } },
  { id: 'preview-document', type: 'data-classification', priority: 'MEDIUM', timestamp: 0, payload: { ...mockDataClassifications[0], id: 'preview-document', timestamp: '09:00' } },
]

export default function DispatchConsole({ designPreview = false, player, adminTools = false, courseModeEnabled = false }: { designPreview?: boolean; player?: import('@/lib/player-auth').Player; adminTools?: boolean; courseModeEnabled?: boolean }) {
  const progressionEnabled = (TRAINING_CONFIG.phaseProgressionEnabled || courseModeEnabled) && !designPreview
  const emailCourse = useEmailCourse(progressionEnabled, player?.userId ?? 'design-preview')
  const courseRef = useRef(emailCourse.course)
  courseRef.current = emailCourse.course
  const [courseEvidence, setCourseEvidence] = useState<string[]>([])
  const demoUserCode = player?.userCode ?? 'design-preview'
  const pendingAnswerKey = `sentri-pending-answer-v1-${demoUserCode}`
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const savingRef = useRef(false)
  const retrySave = useRef<(() => Promise<unknown>) | null>(null)
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve())
  const playCorrectSound = useCorrectAnswerSound()
  const playWrongSound = useWrongAnswerSound()
  const playTaskNotificationSound = useTaskNotificationSound()
  const { isMuted, toggleMute } = useBackgroundMusic()
  const [currentTime, setCurrentTime] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '16:10'>('16:9')
  
  const handleSaveSettings = (settings: { aspectRatio: '16:9' | '16:10' }) => {
    setAspectRatio(settings.aspectRatio)
    // Update the game screen height based on aspect ratio
    const gameScreen = document.querySelector('.game-screen') as HTMLElement
    if (gameScreen) {
      gameScreen.style.height = settings.aspectRatio === '16:9' ? '1080px' : '1200px'
    }
  }

  const [gameState, setGameState] = useState<GameState>({
    graduationProgress: designPreview ? 82 : 0,
    currentTaskType: 'email',
    currentEmailId: designPreview ? 'preview-email' : null,
    currentPasswordId: designPreview ? 'preview-password' : null,
    currentDocumentId: designPreview ? 'preview-document' : null,
    investigatedCategories: new Set(),
    decision: null,
    day: 7,
    todaysTasksCompleted: 0,
    tasksGeneratedToday: designPreview ? 3 : 0,
    dispatchQueue: designPreview ? previewQueue : [],
  })
  const [checkedPasswordCharacteristics, setCheckedPasswordCharacteristics] = useState<Set<string>>(new Set())
  const [showHelp, setShowHelp] = useState(false)
  useDialogFocus(showHelp, () => setShowHelp(false))
  const [isLoadingTask, setIsLoadingTask] = useState(false)
  const [dayMode, setDayMode] = useState<'not-started' | 'running' | 'paused'>('not-started')
  const dayModeRef = useRef(dayMode)
  const [dayLoaded, setDayLoaded] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const nextGenerationAt = useRef(0)
  const [investigationList, setInvestigationList] = useState<InvestigationCategory[]>([
    { id: 'profile', label: 'Profile', description: 'Verify sender identity and domain legitimacy', checked: false, hasEvidence: true },
    { id: 'link', label: 'Link', description: 'Analyze URLs and check for suspicious redirects', checked: false, hasEvidence: true },
    { id: 'file', label: 'File', description: 'Examine attachments for malware and threats', checked: false, hasEvidence: true },
    { id: 'language', label: 'Language', description: 'Detect unusual grammar and phishing patterns', checked: false, hasEvidence: true },
    { id: 'context', label: 'Context', description: 'Review urgency and legitimacy of request', checked: false, hasEvidence: true },
    { id: 'request', label: 'Request', description: 'Evaluate unusual access or permission demands', checked: false, hasEvidence: true },
  ])
  const [showDecisionModal, setShowDecisionModal] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [lastDecision, setLastDecision] = useState<'legitimate' | 'phishing' | null>(null)
  const [emailAttempt, setEmailAttempt] = useState(0)
  const [lastEmailAttemptNumber, setLastEmailAttemptNumber] = useState(0)
  const [lastEmailCorrect, setLastEmailCorrect] = useState(false)
  const [showPasswordFeedback, setShowPasswordFeedback] = useState(false)
  const [lastPasswordDecision, setLastPasswordDecision] = useState<'approve' | 'revision' | 'reject' | null>(null)
  const [showDataClassificationFeedback, setShowDataClassificationFeedback] = useState(false)
  const [lastDataClassificationDecision, setLastDataClassificationDecision] = useState<'public' | 'internal' | 'confidential' | 'restricted' | null>(null)
  const [showContactModal, setShowContactModal] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [showDispatchQueue, setShowDispatchQueue] = useState(true)
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(designPreview ? 'preview-document' : null)
  const usedIncidentsRef = useRef<Set<string>>(new Set())
  const demoScenarioIndexRef = useRef(0)
  const [investigationPerformance, setInvestigationPerformance] = useState(createInitialInvestigationPerformance)

  const generationRef = useRef(false)
  const databaseExhaustedRef = useRef(false)
  const gameStateRef = useRef(gameState)
  gameStateRef.current = gameState
  const performanceRef = useRef(investigationPerformance)
  performanceRef.current = investigationPerformance
  const knownAssignmentsRef = useRef<Set<string>>(new Set())

  // Refresh pauses the day and preserves outstanding work, so chat cannot bypass it.
  useEffect(() => {
    if (!designPreview) {
      try {
        const raw = sessionStorage.getItem(`sentri-day-v1-${demoUserCode}`)
        if (raw) {
          const saved = JSON.parse(raw)
          if (Array.isArray(saved.queue) && saved.queue.every((item: DispatchItem) => item && typeof item.id === 'string' && ['email', 'password', 'data-classification'].includes(item.type) && item.payload)) {
            setGameState(prev => ({ ...prev, dispatchQueue: saved.queue, tasksGeneratedToday: Number(saved.generated) || 0, todaysTasksCompleted: Number(saved.completed) || 0 }))
            saved.queue.forEach((item: DispatchItem) => { if (item.assignmentId) knownAssignmentsRef.current.add(item.assignmentId) })
            const mode = saved.started || saved.queue.length ? 'paused' : 'not-started'
            dayModeRef.current = mode; setDayMode(mode)
            const pending = sessionStorage.getItem(pendingAnswerKey)
            if (pending) {
              const input = JSON.parse(pending)
              const task = saved.queue.find((item: DispatchItem) => item.attemptId === input.attemptId)
              if (task && typeof input.decision === 'string' && Array.isArray(input.investigatedCategories) &&
                  input.investigatedCategories.every((value: unknown) => typeof value === 'string')) {
                startSave(input, () => {
                  completeQueuedTask(task.id)
                  try { sessionStorage.removeItem(pendingAnswerKey) } catch { /* Optional browser storage. */ }
                })
              }
            }
          }
        }
      } catch { /* Keep a fresh day if session storage is unavailable. */ }
    }
    setDayLoaded(true)
  }, [demoUserCode, designPreview])
  useEffect(() => {
    if (!dayLoaded || designPreview) return
    try { sessionStorage.setItem(`sentri-day-v1-${demoUserCode}`, JSON.stringify({ started: dayMode !== 'not-started', queue: gameState.dispatchQueue, generated: gameState.tasksGeneratedToday, completed: gameState.todaysTasksCompleted })) } catch { /* Storage is optional. */ }
  }, [dayLoaded, dayMode, gameState.dispatchQueue, gameState.tasksGeneratedToday, gameState.todaysTasksCompleted, demoUserCode, designPreview])
  const chatAvailable = dayLoaded && dayMode !== 'running' && gameState.dispatchQueue.length === 0 && !isLoadingTask && !connectionError && !emailCourse.busy
  useEffect(() => { if (!chatAvailable) setShowChat(false) }, [chatAvailable])

  // Course assignments join the existing dispatch queue; the desk and other task
  // panels retain their normal flow. One live email assignment exists at a time.
  useEffect(() => {
    const course = emailCourse.course
    if (!course) return
    const active = course.active
    setGameState(prev => {
      const otherTasks = prev.dispatchQueue.filter(item => item.type !== 'email')
      const item: DispatchItem | null = active ? {
        id: active.id, assignmentId: active.id, type: 'email', source: 'course', timestamp: Date.now(),
        priority: course.phase === 'master' ? 'HIGH' : 'MEDIUM',
        courseInfo: { phase: course.phase, attemptLimit: active.attemptLimit, submissionsUsed: active.submissionsUsed, nextRewardExp: active.nextRewardExp, recovery: active.recovery },
        payload: {
          id: active.id, from: active.public.from.split('<')[0].trim(),
          senderDomain: active.public.from.match(/<([^>]+)>/)?.[1] ?? active.public.from,
          to: active.public.to, subject: active.public.subject, body: active.public.body,
          workContext: active.public.context, timestamp: 'Assigned', attachments: [],
          clues: { senderProfile: '', linkDetails: [], attachmentAnalysis: '', languageAnalysis: '', contextAnalysis: '', requestAnalysis: '' },
        },
      } : null
      return { ...prev, graduationProgress: course.progress,
        dispatchQueue: item ? [item, ...otherTasks] : otherTasks,
        currentEmailId: active?.id ?? null,
      }
    })
  }, [emailCourse.course])

  useEffect(() => {
    setCourseEvidence([])
    setShowDecisionModal(false)
    setInvestigationList(prev => prev.map(item => ({ ...item, checked: false })))
    setGameState(prev => ({ ...prev, investigatedCategories: new Set() }))
  }, [emailCourse.course?.active?.id])
  useEffect(() => { databaseExhaustedRef.current = false }, [emailCourse.course?.phase])
  useEffect(() => {
    if (progressionEnabled) return
    setGameState(prev => ({ ...prev, dispatchQueue: prev.dispatchQueue.filter(item => item.source !== 'course') }))
  }, [progressionEnabled])

  const createMockDispatchItem = (): DispatchItem | null => {
    const type = !progressionEnabled ? regularTaskType(gameStateRef.current.tasksGeneratedToday)
      : courseRef.current?.phase !== 'easy' && gameStateRef.current.tasksGeneratedToday % 2 ? 'data-classification' : 'password'
    if (type !== 'email') {
      const catalog = type === 'password' ? mockPasswords : mockDataClassifications
      const available = catalog.filter(item => !gameStateRef.current.dispatchQueue.some(active => active.id === item.id))
      const payload = available[Math.floor(Math.random() * available.length)]
      return payload ? { type, id: payload.id, timestamp: Date.now(), payload } : null
    }
    const availableEmails = mockEmails.filter(email => !gameStateRef.current.dispatchQueue.some(item => item.id === email.id))
    const fixedDemoIds = ['email-2', 'email-1', 'email-4']
    let email: Email | null = null

    if (demoScenarioIndexRef.current < fixedDemoIds.length) {
      email = availableEmails.find((candidate) => candidate.id === fixedDemoIds[demoScenarioIndexRef.current]) ?? null
      demoScenarioIndexRef.current += 1
    } else {
      email = selectAdaptiveEmail(availableEmails, performanceRef.current, usedIncidentsRef.current)
    }

    if (!email) {
      const lastIncidentId = Array.from(usedIncidentsRef.current).at(-1)
      usedIncidentsRef.current.clear()
      email = selectAdaptiveEmail(availableEmails, performanceRef.current, usedIncidentsRef.current)
      if (email && email.id === lastIncidentId) {
        usedIncidentsRef.current.add(email.id)
        email = selectAdaptiveEmail(availableEmails, performanceRef.current, usedIncidentsRef.current)
      }
    }

    if (!email) return null
    usedIncidentsRef.current.add(email.id)
    return { type: 'email' as const, id: email.id, timestamp: Date.now(), payload: email }
  }

  const createNextDispatchItem = async (): Promise<DispatchItem | null> => {
    if (designPreview) return createMockDispatchItem()
    if (courseRef.current?.status === 'graduated' || courseRef.current?.status === 'needs-follow-up') return null
    if (databaseExhaustedRef.current) return null
    setIsLoadingTask(true)
    try {
      await pendingSave.current
      const item = await requestPersonalizedTask(demoUserCode, {
        taskType: !progressionEnabled ? regularTaskType(gameStateRef.current.tasksGeneratedToday)
          : courseRef.current?.phase && courseRef.current.phase !== 'easy' && gameStateRef.current.tasksGeneratedToday % 2 ? 'data-classification' : 'password',
        knownAssignmentIds: [...knownAssignmentsRef.current],
      })
      setConnectionError(null)
      return item
    } catch (error) {
      // A database response of 404 means there is no eligible persisted task for
      // this request. Do not silently replace it with local catalog data: doing
      // so makes the UI show tasks that cannot appear in Neon. Mock data is only
      // allowed when the developer explicitly enables the fallback flag.
      if (error instanceof Error && 'status' in error && error.status === 404) {
        if (process.env.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK === 'true') {
          setConnectionError(null)
          return createMockDispatchItem()
        }
        // Only a phase's optional practice catalog can be exhausted globally.
        // In regular mode, retry the same requested slot as content becomes available.
        databaseExhaustedRef.current = progressionEnabled
        // Regular mode must explain an unavailable slot instead of showing a
        // permanently empty queue while silently retrying the same task type.
        setConnectionError(progressionEnabled ? null : error.message)
        return null
      }
      setConnectionError(error instanceof Error ? error.message : 'Unable to load the next task')
      if (process.env.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK === 'true') return createMockDispatchItem()
      throw error
    } finally {
      setIsLoadingTask(false)
    }
  }

  function startSave(input: Parameters<typeof submitTaskDecision>[0], onSaved?: () => void) {
    try { sessionStorage.setItem(pendingAnswerKey, JSON.stringify(input)) } catch { /* Server replay still protects saved answers. */ }
    const persist = async () => {
      const result = await submitTaskDecision(input)
      if (result) setGameState(prev => ({ ...prev, graduationProgress: courseRef.current?.progress ?? result.graduationPercentage }))
      retrySave.current = null
      setConnectionError(null)
      onSaved?.()
    }
    retrySave.current = persist
    pendingSave.current = persist()
    void pendingSave.current.catch(() => setConnectionError('Your answer is waiting to be saved. Click Retry to save it safely.'))
  }

  const saveDecision = (id: string | null, decision: string, categories: string[] = [], attemptNumber = 1) => {
    const item = gameState.dispatchQueue.find(entry => entry.id === id)
    if (designPreview || !item?.attemptId) return
    startSave({ attemptId: item.attemptId, decision, investigatedCategories: categories, attemptNumber })
  }

  useEffect(() => {
    if (designPreview) return
    void fetchPlayerProfile(demoUserCode).then((profile) => {
      setGameState((prev) => ({ ...prev, graduationProgress: courseRef.current?.progress ?? (progressionEnabled ? 0 : profile.graduationPercentage) }))
    }).catch((error) => setConnectionError(error.message))
  }, [demoUserCode, designPreview, progressionEnabled])

  // Update time every minute (client-side only to avoid hydration mismatch)
  useEffect(() => {
    const updateTime = () => {
      const now = dayjs()
      setCurrentTime(`DAY ${now.date().toString().padStart(2, '0')} • ${now.format('hh:mm A')}`)
    }
    // Set initial time immediately on first render
    updateTime()
    // Then update every minute
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

  // Keep tasks arriving while the player works, up to 20 per day.
  useEffect(() => {
    if (designPreview || !dayLoaded) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const generate = async () => {
      if (cancelled) return
      if (dayModeRef.current === 'running' && Date.now() >= nextGenerationAt.current && !generationRef.current && gameStateRef.current.tasksGeneratedToday < 20 &&
          (!progressionEnabled || gameStateRef.current.dispatchQueue.filter(item => item.type !== 'email').length < 2)) {
        generationRef.current = true
        try {
          const nextTask = await createNextDispatchItem()
          if (!cancelled && nextTask) {
            if (nextTask.assignmentId) knownAssignmentsRef.current.add(nextTask.assignmentId)
            setGameState(prev => {
              if (prev.dispatchQueue.some(item => item.id === nextTask.id)) return prev
              const empty = prev.dispatchQueue.length === 0
              return {
                ...prev,
                tasksGeneratedToday: prev.tasksGeneratedToday + 1,
                dispatchQueue: [...prev.dispatchQueue, nextTask],
                ...(empty ? {
                  currentTaskType: nextTask.type,
                  currentEmailId: nextTask.type === 'email' ? nextTask.id : null,
                  currentPasswordId: nextTask.type === 'password' ? nextTask.id : null,
                  currentDocumentId: nextTask.type === 'data-classification' ? nextTask.id : null,
                } : {}),
              }
            })
            playTaskNotificationSound()
          }
        } catch { /* Keep the queue usable and retry on the next interval. */ }
        finally { generationRef.current = false; nextGenerationAt.current = Date.now() + getRandomDelay() }
      }
      if (!cancelled) timer = setTimeout(generate, 500)
    }
    void generate()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [designPreview, progressionEnabled, dayLoaded])

  const completeQueuedTask = (id: string | null) => {
    try { sessionStorage.removeItem(pendingAnswerKey) } catch { /* Optional browser storage. */ }
    databaseExhaustedRef.current = false
    setGameState(prev => {
      const queue = prev.dispatchQueue.filter(item => item.id !== id)
      const next = queue[0]
      return { ...prev, dispatchQueue: queue,
        todaysTasksCompleted: prev.todaysTasksCompleted + 1,
        currentTaskType: next?.type ?? prev.currentTaskType,
        currentEmailId: next?.type === 'email' ? next.id : null,
        currentPasswordId: next?.type === 'password' ? next.id : null,
        currentDocumentId: next?.type === 'data-classification' ? next.id : null,
      }
    })
    setShowDispatchQueue(true)
  }

  useEffect(() => {
    setSelectedQueueItemId(current => gameState.dispatchQueue.some(item => item.id === current)
      ? current : gameState.dispatchQueue[0]?.id ?? null)
  }, [gameState.dispatchQueue])

  const handleStartQueueTask = (item: DispatchItem) => {
    setGameState(prev => ({ ...prev, currentTaskType: item.type,
      currentEmailId: item.type === 'email' ? item.id : prev.currentEmailId,
      currentPasswordId: item.type === 'password' ? item.id : prev.currentPasswordId,
      currentDocumentId: item.type === 'data-classification' ? item.id : prev.currentDocumentId,
    }))
    setShowDispatchQueue(false)
  }

  // Auto-select first available task when tasks are added or task type changes
  useEffect(() => {
    const emailTasks = gameState.dispatchQueue.filter((item) => item.type === 'email')
    const passwordTasks = gameState.dispatchQueue.filter((item) => item.type === 'password')
    const dataTasks = gameState.dispatchQueue.filter((item) => item.type === 'data-classification')

    setGameState((prev) => {
      let updated = false
      const newState = { ...prev }

      // Auto-select first email if current one doesn't exist in queue
      if (gameState.currentTaskType === 'email' && emailTasks.length > 0) {
        const emailExists = emailTasks.some((item) => item.id === prev.currentEmailId)
        if (!emailExists) {
          newState.currentEmailId = emailTasks[0].id
          updated = true
        }
      }

      // Auto-select first password if current one doesn't exist in queue
      if (gameState.currentTaskType === 'password' && passwordTasks.length > 0) {
        const passwordExists = passwordTasks.some((item) => item.id === prev.currentPasswordId)
        if (!passwordExists) {
          newState.currentPasswordId = passwordTasks[0].id
          updated = true
        }
      }

      // Auto-select first document if current one doesn't exist in queue
      if (gameState.currentTaskType === 'data-classification' && dataTasks.length > 0) {
        const docExists = dataTasks.some((item) => item.id === prev.currentDocumentId)
        if (!docExists) {
          newState.currentDocumentId = dataTasks[0].id
          updated = true
        }
      }

      return updated ? newState : prev
    })
  }, [gameState.dispatchQueue, gameState.currentTaskType])

  // Initialize currentTime with a placeholder to prevent hydration mismatch
  const displayTime = designPreview ? 'DAY 07 • 09:30 AM' : currentTime || 'DAY -- • --:-- --'

  const currentEmail = gameState.dispatchQueue
    .find((item) => item.id === gameState.currentEmailId && item.type === 'email')
    ?.payload as Email | undefined

  const handleSelectEmail = (emailId: string) => {
    setGameState((prev) => ({
      ...prev,
      currentEmailId: emailId,
      investigatedCategories: new Set(),
      decision: null,
    }))
    setInvestigationList((prev) =>
      prev.map((item) => ({
        ...item,
        checked: false,
      }))
    )
    setShowDecisionModal(false)
    setNotificationCount(0) // Reset notification when viewing an incident
  }

  const handleInvestigate = (categoryId: string) => {
    setGameState((prev) => ({
      ...prev,
      investigatedCategories: new Set([...prev.investigatedCategories, categoryId]),
    }))
    setInvestigationList((prev) =>
      prev.map((item) =>
        item.id === categoryId
          ? { ...item, checked: true }
          : item
      )
    )
  }

  const handleCheckboxChange = (categoryId: string) => {
    const isCurrentlyChecked = investigationList.find((item) => item.id === categoryId)?.checked
    
    setInvestigationList((prev) =>
      prev.map((item) =>
        item.id === categoryId
          ? { ...item, checked: !item.checked }
          : item
      )
    )

    // Update investigation tracking based on checkbox state
    if (!isCurrentlyChecked) {
      // Checking: add to investigated categories
      setGameState((prev) => ({
        ...prev,
        investigatedCategories: new Set([...prev.investigatedCategories, categoryId]),
      }))
    } else {
      // Unchecking: remove from investigated categories
      const newInvestigated = new Set(gameState.investigatedCategories)
      newInvestigated.delete(categoryId)
      setGameState((prev) => ({
        ...prev,
        investigatedCategories: newInvestigated,
      }))
    }
  }

  const handleMakeDecision = async (decision: 'legitimate' | 'phishing') => {
    if (!currentEmail) return

    const active = emailCourse.course?.active
    if (!designPreview && active?.id === currentEmail.id) {
      if (emailCourse.busy || emailCourse.error || active.feedback) return
      setShowDecisionModal(false)
      const response = await emailCourse.send({ action: 'submit', requestId: crypto.randomUUID(), answer: {
        assignmentId: active.id, decision, evidenceIds: courseEvidence,
      } })
      if (response?.course.active?.feedback?.passed) playCorrectSound()
      else if (response) playWrongSound()
      return
    }
    if (progressionEnabled) return

    const suspiciousIds = currentEmail.requiredInvestigationCategories ?? Object.entries(currentEmail.investigationStates ?? {})
      .filter(([, state]) => state === 'suspicious')
      .map(([id]) => id as InvestigationCategory['id'])
    const suspicious = new Set(suspiciousIds)
    const checked = new Set(investigationList.filter((item) => item.checked).map((item) => item.id))
    const checklistMatches = suspicious.size === checked.size && [...suspicious].every((id) => checked.has(id))
    const decisionMatches = (decision === 'phishing' && currentEmail.isLegitimate === false) ||
      (decision === 'legitimate' && currentEmail.isLegitimate === true)
    const hasChecklist = currentEmail.requiredInvestigationCategories !== undefined || currentEmail.investigationStates !== undefined
    const isCorrect = decisionMatches && (!hasChecklist || checklistMatches)
    const attemptNumber = isCorrect ? emailAttempt + 1 : Math.min(4, emailAttempt + 1)
    const progressIncrease = isCorrect ? (attemptNumber === 1 ? 5 : attemptNumber === 2 ? 2 : 0) : attemptNumber >= 4 ? -1 : 0
    const nextPerformance = updateInvestigationPerformance(
      investigationPerformance,
      currentEmail,
      checked,
      attemptNumber,
      !isCorrect && attemptNumber >= 4,
    )
    setInvestigationPerformance(nextPerformance)

    if (isCorrect) playCorrectSound()
    else {
      playWrongSound()
      setEmailAttempt(attemptNumber)
    }

    setLastEmailAttemptNumber(attemptNumber)
    setLastEmailCorrect(isCorrect)
    setGameState((prev) => ({
      ...prev,
      decision,
      graduationProgress: Math.max(0, Math.min(100, prev.graduationProgress + progressIncrease)),
    }))
    setLastDecision(decision)
    setShowDecisionModal(false)
    setShowFeedback(true)
    if (isCorrect || attemptNumber >= 4) saveDecision(gameState.currentEmailId, decision, [...checked], attemptNumber)
  }

  const handleContinueAfterFeedback = async () => {
    const shouldRetry = !lastEmailCorrect && lastEmailAttemptNumber < 4

    if (shouldRetry) { setShowFeedback(false); setLastDecision(null); return }
    if (savingRef.current) return
    savingRef.current = true
    try {
      await pendingSave.current.catch(error => {
        if (!retrySave.current) throw error
        pendingSave.current = retrySave.current()
        return pendingSave.current
      })
    } catch { setConnectionError('Your answer is still waiting to be saved. Please retry.'); return }
    finally { savingRef.current = false }
    setShowFeedback(false)
    setLastDecision(null)

    setEmailAttempt(0)
    setLastEmailAttemptNumber(0)
    setLastEmailCorrect(false)
    setInvestigationList((prev) => prev.map((item) => ({ ...item, checked: false })))
    
    // Move to the next case after a correct answer or the fourth wrong attempt
    completeQueuedTask(gameState.currentEmailId)
  }

  const handleTogglePasswordCharacteristic = (id: string) => {
    setCheckedPasswordCharacteristics((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handlePasswordDecision = (decision: 'approve' | 'revision' | 'reject') => {
    let progressIncrease = 0
    const currentPassword = gameState.dispatchQueue.find((p) => p.id === gameState.currentPasswordId)?.payload as Password | undefined
    if (!currentPassword) return
    
    if (currentPassword) {
      const isCorrect = decision === currentPassword.correctDecision
      if (isCorrect) {
        playCorrectSound()
        progressIncrease = 5
      } else {
        playWrongSound()
      }
    }
    
    setLastPasswordDecision(decision)
    setShowPasswordFeedback(true)
    saveDecision(gameState.currentPasswordId, decision, [...checkedPasswordCharacteristics])
    
    // Update progress immediately
    setGameState((prev) => ({
      ...prev,
      graduationProgress: !progressionEnabled ? Math.min(100, prev.graduationProgress + progressIncrease) : prev.graduationProgress,
    }))
  }

  const handleContinueAfterPasswordFeedback = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      await pendingSave.current.catch(error => {
        if (!retrySave.current) throw error
        pendingSave.current = retrySave.current()
        return pendingSave.current
      })
    } catch { setConnectionError('Your answer is still waiting to be saved. Please retry.'); return }
    finally { savingRef.current = false }
    setShowPasswordFeedback(false)
    setLastPasswordDecision(null)
    setCheckedPasswordCharacteristics(new Set())
    
    completeQueuedTask(gameState.currentPasswordId)
  }

  const handleDataClassification = (classification: 'public' | 'internal' | 'confidential' | 'restricted') => {
    let progressIncrease = 0
    const currentDocument = gameState.dispatchQueue.find((d) => d.id === gameState.currentDocumentId)?.payload as DataClassification | undefined
    if (!currentDocument) return
    
    if (currentDocument) {
      const isCorrect = classification === currentDocument.correctClassification
      if (isCorrect) {
        playCorrectSound()
        progressIncrease = 5
      } else {
        playWrongSound()
      }
    }
    
    setLastDataClassificationDecision(classification)
    setShowDataClassificationFeedback(true)
    saveDecision(gameState.currentDocumentId, classification)
    
    // Update progress immediately
    setGameState((prev) => ({
      ...prev,
      graduationProgress: !progressionEnabled ? Math.min(100, prev.graduationProgress + progressIncrease) : prev.graduationProgress,
    }))
  }

  const handleContinueAfterDataClassificationFeedback = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      await pendingSave.current.catch(error => {
        if (!retrySave.current) throw error
        pendingSave.current = retrySave.current()
        return pendingSave.current
      })
    } catch { setConnectionError('Your answer is still waiting to be saved. Please retry.'); return }
    finally { savingRef.current = false }
    setShowDataClassificationFeedback(false)
    setLastDataClassificationDecision(null)
    
    completeQueuedTask(gameState.currentDocumentId)
  }

  const handleSelectTask = (taskType: 'email' | 'password' | 'data-classification') => {
    setGameState((prev) => ({
      ...prev,
      currentTaskType: taskType,
    }))
    setShowDispatchQueue(false)
  }

  const handleDayControl = () => {
    const next = dayModeRef.current === 'running' ? 'paused' : 'running'
    dayModeRef.current = next
    setDayMode(next)
    if (next === 'running') {
      setShowChat(false)
      nextGenerationAt.current = 0
      databaseExhaustedRef.current = false
    }
  }

  return (
    <div 
      className="sentri-console w-[1920px] text-foreground flex flex-col" 
      style={{ height: aspectRatio === '16:9' ? '1080px' : '1200px' }}
    >
      {designPreview && <span className="design-preview-label">DESIGN PREVIEW · SAMPLE DATA</span>}
      {/* Header - Fixed height */}
      {connectionError && <div role="alert" className="connection-notice"><span>{connectionError}</span><button onClick={() => {
        if (!retrySave.current) { window.location.reload(); return }
        if (savingRef.current) return
        savingRef.current = true
        pendingSave.current = retrySave.current()
        void pendingSave.current.catch(() => setConnectionError('Your answer is still waiting to be saved. Please retry.'))
          .finally(() => { savingRef.current = false })
      }}>RETRY</button></div>}
      {emailCourse.error && <div role="alert" className="connection-notice"><span>{emailCourse.error}</span><button disabled={emailCourse.busy} onClick={() => void emailCourse.retry()}>RESUME SAVED COURSE</button></div>}
      <Header 
        currentTime={displayTime}
        graduationProgress={gameState.graduationProgress}
        progressLabel={emailCourse.course ? `TRUST LEVEL · ${emailCourse.course.phase.toUpperCase()} · ${Math.floor(emailCourse.course.exp)} / 1,000 EXP` : undefined}
        onSettingsClick={() => setShowSettings(true)}
        onHelpClick={() => setShowHelp(true)}
      />

      {/* Main Content - 3 Column Layout: 320px | flexible | 320px with 16px gaps */}
      <div className="console-workspace">
        {/* Left Sidebar - Fixed 320px width */}
        <div className="console-sidebar">
          <CompanyCard 
            companyName={player?.company ?? "SENTRI"}
            department={player?.department ?? "TRAINING"}
            role="Associate"
          />
          <TasksPanel 
            currentTaskType={gameState.currentTaskType} 
            onSelectTask={handleSelectTask}
            dispatchQueue={gameState.dispatchQueue}
            isQueueOpen={showDispatchQueue}
          />
          <button onClick={() => setShowDispatchQueue(true)} className={`view-queue-button metal-frame ${showDispatchQueue ? 'is-active' : ''}`} aria-current={showDispatchQueue ? 'page' : undefined}>
            <GameIcon name="file" size={32} /><span>VIEW QUEUE</span><span>{gameState.dispatchQueue.length}</span>
          </button>
          <SentriPanel onOpenChat={() => setShowChat(true)} chatAvailable={chatAvailable} chatHint={!dayLoaded ? "Loading your day…" : dayMode === "running" ? "Pause the day to chat with SENTRI." : isLoadingTask ? "Waiting for the current assignment…" : gameState.dispatchQueue.length ? "Finish queued tasks to unlock chat." : connectionError ? "Resolve the connection error to unlock chat." : "Click to chat with SENTRI."} isQueueOpen={showDispatchQueue} courseStatus={emailCourse.course?.status} courseMessage={emailCourse.course?.message} onResumeCourse={() => void emailCourse.send({ action: 'resume' })} />
        </div>

        {/* Center Content - Task-specific UI or Dispatch Queue */}
        <div className="console-center">
          {showDispatchQueue ? (
            <DispatchQueueView
              queue={gameState.dispatchQueue}
              selectedQueueId={selectedQueueItemId}
              onSelectQueue={setSelectedQueueItemId}
              isLoading={isLoadingTask}
            />
          ) : gameState.currentTaskType === 'email' ? (
            <EmailInvestigation
              emails={gameState.dispatchQueue
                .filter((item) => item.type === 'email')
                .map((item) => item.payload as Email)
              }
              selectedEmailId={gameState.currentEmailId}
              currentEmail={currentEmail}
              onSelectEmail={handleSelectEmail}
              onInvestigate={handleInvestigate}
              investigatedCategories={gameState.investigatedCategories}
            />
          ) : gameState.currentTaskType === 'password' ? (
            <div className="flex flex-col gap-4 h-full overflow-hidden">
              <PasswordStrengthTask
                password={
                  gameState.dispatchQueue
                    .find((item) => item.id === gameState.currentPasswordId && item.type === 'password')
                    ?.payload as Password | undefined
                }
                checkedCharacteristics={checkedPasswordCharacteristics}
                onToggleCharacteristic={handleTogglePasswordCharacteristic}
              />
              <PasswordDecisionPanel onMakeDecision={handlePasswordDecision} />
            </div>
          ) : gameState.currentTaskType === 'data-classification' ? (
            <DataClassificationTask
              document={
                gameState.dispatchQueue
                  .find((item) => item.id === gameState.currentDocumentId && item.type === 'data-classification')
                  ?.payload as DataClassification | undefined
              }
            />
          ) : null}
        </div>

        {/* Right Sidebar - Fixed 430px width */}
        <div className="console-details">
          {showDispatchQueue ? (
            <TaskDetailsPanel selectedQueueItem={gameState.dispatchQueue.find(q => q.id === selectedQueueItemId) || null} onStartTask={handleStartQueueTask} />
          ) : gameState.currentTaskType === 'email' ? (
            <InvestigationPanel
              investigationList={investigationList}
              onMakeDecision={() => setShowDecisionModal(true)}
              onCheckboxChange={handleCheckboxChange}
              supportingRecords={!designPreview && emailCourse.course?.active ? emailCourse.course.active.public.evidence.map(e => ({...e, checked: courseEvidence.includes(e.id)})) : undefined}
              onRecordChange={id => setCourseEvidence(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])}
              onVerify={() => setShowContactModal(true)}
              disabled={progressionEnabled && (!emailCourse.course?.active || emailCourse.busy || Boolean(emailCourse.error) || Boolean(emailCourse.course.active.feedback))}
              attemptLabel={emailCourse.course?.active ? `${emailCourse.course.active.submissionsUsed}/${emailCourse.course.active.attemptLimit} USED` : undefined}
              supportingEvidence={progressionEnabled}
            />
          ) : gameState.currentTaskType === 'password' ? (
            <PasswordPolicyPanel />
          ) : gameState.currentTaskType === 'data-classification' ? (
            <DataClassificationDetailsPanel
              document={
                gameState.dispatchQueue
                  .find((item) => item.id === gameState.currentDocumentId && item.type === 'data-classification')
                  ?.payload as DataClassification | undefined
              }
              onClassify={handleDataClassification}
            />
          ) : null}
        </div>
      </div>

      {/* Decision Modal */}
      {showDecisionModal && currentEmail && (
        <DecisionModal
          email={currentEmail}
          onDecide={handleMakeDecision}
          onClose={() => setShowDecisionModal(false)}
        />
      )}

      {/* Feedback Modal */}
      {emailCourse.course?.active?.feedback && <CourseFeedbackModal active={emailCourse.course.active} busy={emailCourse.busy || Boolean(emailCourse.error)} onContinue={async () => {
        const active = emailCourse.course!.active!
        const result = await emailCourse.send({ action: 'acknowledge', assignmentId: active.id, attempt: active.feedback!.attempt })
        if (result && active.feedback!.terminal) completeQueuedTask(active.id)
      }} />}
      {showFeedback && currentEmail && lastDecision && (
          <FeedbackModal
            email={currentEmail}
            userDecision={lastDecision}
            attemptNumber={lastEmailAttemptNumber}
            isCorrect={lastEmailCorrect}
            checkedInvestigationIds={investigationList.filter((item) => item.checked).map((item) => item.id)}
            onContinue={handleContinueAfterFeedback}
          />
      )}

      {/* Password Feedback Modal */}
      {showPasswordFeedback && gameState.currentTaskType === 'password' && lastPasswordDecision && (
        <PasswordFeedbackModal
          password={
            (gameState.dispatchQueue
              .find((item) => item.id === gameState.currentPasswordId && item.type === 'password')
              ?.payload as Password) || mockPasswords[0]
          }
          userDecision={lastPasswordDecision}
          onContinue={handleContinueAfterPasswordFeedback}
        />
      )}

      {/* Data Classification Feedback Modal */}
      {showDataClassificationFeedback && gameState.currentTaskType === 'data-classification' && lastDataClassificationDecision && (
        <DataClassificationFeedbackModal
          document={
            (gameState.dispatchQueue
              .find((item) => item.id === gameState.currentDocumentId && item.type === 'data-classification')
              ?.payload as DataClassification) || mockDataClassifications[0]
          }
          userClassification={lastDataClassificationDecision}
          onContinue={handleContinueAfterDataClassificationFeedback}
        />
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <ContactModal
          contacts={verificationContacts}
          onClose={() => setShowContactModal(false)}
        />
      )}

      {showHelp && <div className="console-modal-backdrop" onClick={() => setShowHelp(false)}><section className="console-modal metal-frame" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={event => event.stopPropagation()}><div className="modal-title"><h2 id="help-title">WELCOME TO YOUR DISPATCH CONSOLE</h2><button className="console-button" aria-label="Close help" onClick={() => setShowHelp(false)}>✕</button></div><div className="paper-surface handbook-pages">
        <p>Open View Queue to see your assignments. Select a task, review its details, then choose Start Task.</p>
        {progressionEnabled ? <>
          <p>Email EXP uses four phases of 250 EXP: Easy, Normal, Hard and Master. Submission limits are 3, 2, 2 and 1. Reading evidence is free; select the records supporting your decision before submitting.</p>
          <p>A pass requires the right decision, at least 80% performance and all critical checks. Passing on your first, second or third submission earns 100%, 70% or 40% of the available EXP.</p>
          <p>Fresh recovery cases can restore missed EXP within your company’s allowance. Graduate by earning all 1,000 EXP and passing the required objectives, including Master. Password and data-classification practice stay available but do not add to email-course EXP.</p>
          {emailCourse.course && <p>Company plan: approximately {emailCourse.course.targetMinutes} minutes. Recovery cases used: {emailCourse.course.recoveryUsed}/{emailCourse.course.recoveryAllowance}. Actual completion time varies.</p>}
        </> : <p>Regular practice has no progression phases. Tasks follow a 70% email investigation, 20% data classification and 10% password review mix. All three task types are available from the start.</p>}
        <p>Use the handbook for company policies and Notes to record your observations.</p>
      </div></section></div>}

      {/* Settings Modal */}
      <SettingsModal
        adminTools={adminTools}
        accountName={player?.name}
        accountEmail={player?.email}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSaveSettings={handleSaveSettings}
        currentAspectRatio={aspectRatio}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />

      <SentriChat open={showChat && chatAvailable} onClose={() => setShowChat(false)} paused={dayMode === "paused"} />

      {/* Persistent Desk UI */}
      <DeskUI 
        progressPercentage={gameState.graduationProgress} 
        onDayControl={handleDayControl}
        dayControlLabel={dayMode === "not-started" ? "START DAY" : dayMode === "running" ? "PAUSE DAY" : "RESUME DAY"}
        tasksCompleted={gameState.todaysTasksCompleted}
        tasksTotal={gameState.todaysTasksCompleted + gameState.dispatchQueue.length}
        isBusy={!dayLoaded}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />
    </div>
  )
}
