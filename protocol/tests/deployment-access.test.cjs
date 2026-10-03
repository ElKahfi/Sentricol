const test=require('node:test'),assert=require('node:assert/strict')
const {NextRequest}=require('next/server')
const createLoader=require('./load-typescript.cjs')

test('Protocol accepts its configured HTTPS host and rejects another origin',()=>{
  const previous=process.env.PROTOCOL_BASE_URL
  process.env.PROTOCOL_BASE_URL='https://sentriprotocol.duckdns.org'
  try {
    const {isProtocolRequest}=createLoader()('lib/requests.ts')
    assert.equal(isProtocolRequest(new NextRequest('https://sentriprotocol.duckdns.org/api/status')),true)
    assert.equal(isProtocolRequest(new NextRequest('https://other.example/api/status')),false)
    assert.equal(isProtocolRequest(new NextRequest('https://sentriprotocol.duckdns.org/api/analyze',{method:'POST',headers:{origin:'https://other.example'}}),true),false)
    assert.equal(isProtocolRequest(new NextRequest('https://sentriprotocol.duckdns.org/api/analyze',{method:'POST',headers:{origin:'https://sentriprotocol.duckdns.org'}}),true),true)
  } finally {if(previous===undefined)delete process.env.PROTOCOL_BASE_URL;else process.env.PROTOCOL_BASE_URL=previous}
})

test('Deployment account check fails closed and sends only verified email',async()=>{
  const oldUrl=process.env.DEPLOYMENT_URL,oldSecret=process.env.PROTOCOL_DEPLOYMENT_SECRET,oldFetch=global.fetch
  process.env.DEPLOYMENT_URL='https://deployment.example.test';process.env.PROTOCOL_DEPLOYMENT_SECRET='x'.repeat(64)
  try {
    let status=200,seen
    global.fetch=async(url,init)=>{seen={url:String(url),init};return {ok:status===200,status,json:async()=>({allowed:true,company:'Acme'})}}
    const {checkDeploymentAccess}=createLoader()('lib/deployment-access.ts')
    assert.deepEqual(await checkDeploymentAccess('worker@example.test'),{company:'Acme'})
    assert.equal(seen.url,'https://deployment.example.test/api/protocol/access')
    assert.deepEqual(JSON.parse(seen.init.body),{email:'worker@example.test'})
    status=404
    await assert.rejects(()=>checkDeploymentAccess('outsider@example.test'),{status:403})
    status=503
    await assert.rejects(()=>checkDeploymentAccess('worker@example.test'),{status:503})
  } finally {
    global.fetch=oldFetch
    if(oldUrl===undefined)delete process.env.DEPLOYMENT_URL;else process.env.DEPLOYMENT_URL=oldUrl
    if(oldSecret===undefined)delete process.env.PROTOCOL_DEPLOYMENT_SECRET;else process.env.PROTOCOL_DEPLOYMENT_SECRET=oldSecret
  }
})

test('revoked Deployment access ends the existing Gmail session',async()=>{
  let removed=false,cleared=false
  class Denied extends Error {constructor(message,status){super(message);this.status=status}}
  const {authorizedSession}=createLoader({
    './deployment-access':{DeploymentAccessError:Denied,checkDeploymentAccess:async()=>{throw new Denied('Inactive employee',403)}},
    './gmail-session':{getSession:()=>({email:'worker@example.test',token:'private-token'}),deleteSession:()=>{removed=true},clearSessionCookie:()=>{cleared=true}},
    './gmail':{gmailConfig:()=>({baseUrl:'https://sentriprotocol.duckdns.org'})},
    './gmail-api':{privateHeaders:{'Cache-Control':'no-store'}},
  })('lib/authorized-session.ts')
  const {session,response}=await authorizedSession(new NextRequest('https://sentriprotocol.duckdns.org/api/gmail/messages'))
  assert.equal(session,null);assert.equal(response.status,403)
  assert.equal(removed,true);assert.equal(cleared,true)
  assert.equal(JSON.stringify(await response.json()).includes('private-token'),false)
})
