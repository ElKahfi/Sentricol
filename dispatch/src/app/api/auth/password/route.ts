import { NextRequest } from 'next/server'
import { currentPlayer, changePassword } from '@/lib/player-auth'
import { allowed, body, json, sessionResponse, validPassword, authFailure } from '@/lib/auth-http'
export async function POST(request: NextRequest) {
  try {
    const input=await body(request)
    if(!input || !validPassword(input.currentPassword) || !validPassword(input.newPassword) || input.newPassword.length<12) return json({error:'Use a new password of at least 12 characters and at most 72 UTF-8 bytes.'},400)
    if(input.currentPassword===input.newPassword) return json({error:'Choose a different password.'},400)
    const player=await currentPlayer()
    if(!player) return json({error:'Please sign in again.'},401)
    if(!allowed('password:'+player.userId)) return json({error:'Too many attempts. Try again in 15 minutes.'},429)
    const updated=await changePassword(player,input.currentPassword,input.newPassword)
    return updated ? sessionResponse(updated,request) : json({error:'Current password is incorrect or your session changed. Please try again.'},400)
  } catch (error) { return authFailure(error,'Unable to change your password. Please try again.') }
}
