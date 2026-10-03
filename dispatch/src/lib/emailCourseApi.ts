import { readApiResponse } from './apiResponse'
import type { Answer, CourseView } from '@/lib/emailCourse'

export type CourseRequest = { action: 'resume' } |
  { action: 'submit'; requestId: string; answer: Answer } |
  { action: 'acknowledge'; assignmentId: string; attempt: number }
export interface CourseResponse {
  course: CourseView;
  learner: { full_name: string; company_name: string; department_name: string; rank_name: string | null };
  generation?: { status: 'created' | 'busy' | 'waiting-review' | 'unavailable' };
}
export async function requestCourse(command: CourseRequest): Promise<CourseResponse> {
  const response = await fetch('/api/email-course', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
  })
  return readApiResponse<CourseResponse>(response)
}
