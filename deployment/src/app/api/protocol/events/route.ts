import { NextRequest } from 'next/server'
import { authorizeProtocol, parseProtocolEvent, recordProtocolEvent } from '@/lib/protocol-events'
import { failure, json } from '@/lib/auth-http'
import { AuthError } from '@/lib/registration'
export const runtime='nodejs'
export async function POST(request:NextRequest) {
  try {
    authorizeProtocol(request.headers.get('authorization'))
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AuthError('Send JSON.',415)
    const reader=request.body?.getReader(); if (!reader) throw new AuthError('Missing event.')
    let size=0; const chunks:Uint8Array[]=[]
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length;
      if(size>2048) { await reader.cancel(); throw new AuthError('Event too large.',413) }; chunks.push(value) }
    let input:unknown
    try { input=JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new AuthError('Invalid JSON.') }
    return json(await recordProtocolEvent(parseProtocolEvent(input)))
  } catch(error) { return failure(error) }
}
