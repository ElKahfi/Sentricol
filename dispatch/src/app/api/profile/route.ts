import { currentPlayer } from '@/lib/player-auth'
import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured, queryOne } from '@/lib/db'

interface ProfileRow {
  user_code: string
  full_name: string
  department_name: string
  rank_name: string | null
  experience: number
  graduation_percentage: string
  unlocked_difficulty: number
}

export async function GET(request: NextRequest) {
  try {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 })
  }

  const userCode = player.userCode
  if (!userCode) {
    return NextResponse.json({ error: 'userCode is required' }, { status: 400 })
  }

    const profile = await queryOne<ProfileRow>(
      `SELECT u.user_code,
              e.full_name,
              d.department_name,
              r.rank_name,
              p.experience,
              p.graduation_percentage,
              p.unlocked_difficulty
         FROM users u
         JOIN employees e ON e.employee_id = u.employee_id
         JOIN departments d ON d.department_id = e.department_id
         LEFT JOIN ranks r ON r.rank_id = e.rank_id
         JOIN user_progress p ON p.user_id = u.user_id
        WHERE u.user_code = $1`,
      [userCode],
    )

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      userCode: profile.user_code,
      name: profile.full_name,
      department: profile.department_name,
      rank: profile.rank_name,
      experience: profile.experience,
      graduationPercentage: Number(profile.graduation_percentage),
      unlockedDifficulty: profile.unlocked_difficulty,
    })
  } catch (error) {
    console.error('Profile lookup failed', error)
    return NextResponse.json({ error: 'Database profile lookup failed' }, { status: 500 })
  }
}
