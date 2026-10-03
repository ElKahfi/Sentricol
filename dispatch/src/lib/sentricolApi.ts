import { readApiResponse } from './apiResponse'
import { DispatchItem } from '@/lib/types'

export interface PlayerProfile {
  userCode: string
  name: string
  department: string
  rank: string | null
  experience: number
  graduationPercentage: number
  unlockedDifficulty: number
}

export async function fetchPlayerProfile(userCode: string) {
  const response = await fetch(`/api/profile?userCode=${encodeURIComponent(userCode)}`, {
    cache: 'no-store',
  })
  return readApiResponse<PlayerProfile>(response)
}

export async function requestPersonalizedTask(userCode: string, options: { taskType?: DispatchItem['type']; knownAssignmentIds?: string[] } = {}) {
  const response = await fetch('/api/tasks/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode, ...options }),
  })
  return readApiResponse<DispatchItem>(response)
}

export async function submitTaskDecision(input: {
  attemptId?: string
  decision: string
  attemptNumber?: number
  investigatedCategories?: string[]
  verified?: boolean
}) {
  if (!input.attemptId) return null

  const response = await fetch('/api/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readApiResponse<{
    isCorrect: boolean
    score: number
    experienceGained: number
    graduationPercentage: number
  }>(response)
}
