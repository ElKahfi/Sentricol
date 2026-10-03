import { NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import { loginPlayer, loginLocalDemoPlayer, currentPlayer } from '@/lib/player-auth'
import { allowed, body, json, sessionResponse, validPassword } from '@/lib/auth-http'
export async function POST(request: NextRequest) {
  const input=await body(request)
  if(!input || typeof input.email!=='string' || input.email.length>150 || !validPassword(input.password)) return json({error:'Enter your work email or username and password.'},400)
  const email=input.email.trim().toLowerCase()
  if(!allowed('login:'+email)) return json({error:'Too many sign-in attempts. Try again in 15 minutes.'},429)
  try {
    if (process.env.NODE_ENV === 'development' &&
        (request.nextUrl.hostname === 'localhost' || request.nextUrl.hostname === '127.0.0.1') &&
        email === 'admin' && input.password === '123') {
      const demo = await loginLocalDemoPlayer()
      return demo ? sessionResponse(demo,request,true) : json({error:'Demo player is missing. Seed the Dispatch database first.'},503)
    }
    const player=await loginPlayer(email,input.password)
    return player ? sessionResponse(player,request) : json({error:'Work email, username, or password is incorrect.'},401)
  } catch { return json({error:'Sign-in is unavailable. Please contact your administrator.'},503) }
}
export async function GET() {
  try { const player=await currentPlayer(); return player ? json({player}) : json({error:'Please sign in.'},401) }
  catch { return json({error:'Sign-in is unavailable.'},503) }
}
export async function DELETE(request: NextRequest) {
  if(request.headers.get('origin')!==request.nextUrl.origin) return json({error:'Invalid request origin.'},403)
  const response=json({ok:true})
  response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:0})
  return response
}
