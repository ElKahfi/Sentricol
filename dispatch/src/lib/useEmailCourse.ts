'use client'

import { useEffect, useRef, useState } from 'react'
import { requestCourse, type CourseRequest, type CourseResponse } from '@/lib/emailCourseApi'

const PENDING_KEY = 'sentri-email-course-pending-v1'

export function useEmailCourse(enabled: boolean, userId: string) {
  const pendingKey = `${PENDING_KEY}-${userId}`
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [data, setData] = useState<CourseResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const initialized = useRef(false)
  const retryCommand = useRef<CourseRequest>({ action: 'resume' })

  async function send(command: CourseRequest) {
    if (!enabled || busyRef.current) return null
    busyRef.current = true; setBusy(true); setError(null)
    try {
      try { if (command.action !== 'resume') sessionStorage.setItem(pendingKey, JSON.stringify(command)) } catch { /* Server feedback survives refresh without browser storage. */ }
      const response = await requestCourse(command)
      try { sessionStorage.removeItem(pendingKey) } catch { /* Browser storage is optional. */ }
      retryCommand.current = { action: 'resume' }
      setData(response)
      if (response.generation?.status === 'created' && response.course.status === 'content-blocked') {
        timer.current = setTimeout(() => { void send({action:'resume'}) }, 250)
      } else if (response.generation?.status === 'busy' && response.course.status === 'content-blocked') {
        timer.current = setTimeout(() => { void send({action:'resume'}) }, 3000)
      }
      return response
    } catch (e) {
      const rejected = e instanceof Error && 'status' in e && typeof e.status === 'number' && e.status >= 400 && e.status < 500
      retryCommand.current = rejected ? { action: 'resume' } : command
      if (rejected) { try { sessionStorage.removeItem(pendingKey) } catch { /* Nothing to clear. */ } }
      setError(e instanceof Error ? e.message : 'Unable to save your answer. Retry the saved request.')
      return null
    } finally { busyRef.current = false; setBusy(false) }
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useEffect(() => {
    if (!enabled || initialized.current) return
    initialized.current = true
    let pending: CourseRequest = { action: 'resume' }
    try {
      const stored = sessionStorage.getItem(pendingKey)
      if (stored) pending = JSON.parse(stored)
    } catch { /* Resume the server state if browser storage is unavailable. */ }
    void send(pending)
  }, [enabled])

  return { data: enabled ? data : null, course: enabled ? data?.course ?? null : null, error: enabled ? error : null, busy: enabled && busy, send,
    retry: () => send(retryCommand.current) }
}
