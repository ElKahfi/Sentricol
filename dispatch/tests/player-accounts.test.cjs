const test=require('node:test'),assert=require('node:assert/strict')
const loader=require('./load-typescript.cjs')
const {NextRequest}=require('next/server')
process.env.DISPATCH_SESSION_SECRET='test-player-session-secret-long-enough'
test('password endpoint requires current credentials and renews cookie after a change',async()=>{
 let user={userId:'9',version:0}, calls=0
 const route=loader({'@/lib/player-auth':{currentPlayer:async()=>user,changePassword:async(p,current)=>{calls++;return current==='123'?{...p,version:1}:null}}})('app/api/auth/password/route.ts')
 const req=(password,current='123')=>new NextRequest('http://localhost:3000/api/auth/password',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({currentPassword:current,newPassword:password})})
 assert.equal((await route.POST(req('short'))).status,400)
 assert.equal(calls,0)
 assert.equal((await route.POST(req('MyNewPassword123!','wrong'))).status,400)
 const changed=await route.POST(req('MyNewPassword123!'))
 assert.equal(changed.status,200)
 assert.match(changed.headers.get('set-cookie'),/HttpOnly/)
 user=null
 assert.equal((await route.POST(req('MyNewPassword123!'))).status,401)
})
test('task generation uses signed-in identity instead of supplied userCode',async()=>{
 const calls=[]
 const route=loader({'@/lib/player-auth':{currentPlayer:async()=>({userId:'9',userCode:'real-user'})},'@/lib/harnessTasks':{generatePlayableEmail:async()=>null},'@/lib/db':{isDatabaseConfigured:()=>true,withTransaction:async fn=>fn({query:async(sql,args)=>{calls.push(args);return{rows:[]}}})}})('app/api/tasks/next/route.ts')
 const response=await route.POST({json:async()=>({userCode:'victim-user',taskType:'email'})})
 assert.equal(response.status,404)
 assert.ok(calls.length>0)
 for(const args of calls) assert.equal(args[0],'real-user')
})
test('attempt submission scopes the lookup to the signed-in user and cannot write another users attempt',async()=>{
 let writes=0
 const route=loader({'@/lib/player-auth':{currentPlayer:async()=>({userId:'9'})},'@/lib/db':{isDatabaseConfigured:()=>true,withTransaction:async fn=>fn({query:async(sql,args)=>{if(sql.includes('SELECT a.attempt_id')){assert.match(sql,/ta.user_id = \$2/);assert.equal(args[1],'9');return{rows:[]}}writes++;return{rows:[]}}})}})('app/api/attempts/route.ts')
 assert.equal((await route.POST({json:async()=>({attemptId:'another-users-attempt',decision:'phishing'})})).status,404)
 assert.equal(writes,0)
})
