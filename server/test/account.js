const PORT = 3198, BASE = `http://localhost:${PORT}`
import { spawn } from 'node:child_process'
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const tmp = '/tmp/del-test-data'; fs.rmSync(tmp, {recursive:true, force:true}); fs.mkdirSync(tmp,{recursive:true})
let pass=0, fail=0; const ok=(c,n)=>{c?(pass++,console.log('  ✓',n)):(fail++,console.error('  ✗ FAIL',n))}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
function client(){let cookie=null;return{get cookie(){return cookie},async req(m,p,b,form){const r=await fetch(BASE+p,{method:m,headers:{...(cookie?{cookie}:{}),...(b&&!form?{'content-type':'application/json'}:{})},body:form?form:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j}}}}

const srv = spawn(process.execPath,['src/index.js'],{cwd:serverDir,env:{...process.env,PORT:String(PORT),DATA_DIR:tmp,UPLOADS_DIR:path.join(tmp,'up'),DB_PATH:path.join(tmp,'t.db')},stdio:['ignore','pipe','pipe']})
srv.stderr.on('data',d=>process.stderr.write('[srv] '+d))
for(let i=0;i<50;i++){try{if((await fetch(BASE+'/health')).ok)break}catch{}await wait(100)}

const A=client(), B=client()
await A.req('POST','/api/auth/register',{email:'a@x.io',username:'alice',displayName:'Alice',password:'password-a1'})
let me=await A.req('GET','/api/auth/me')
ok(me.json.user.role==='owner'&&me.json.user.verified===true,'owner gets verified badge in serializer')
ok(me.json.user.deleteScheduledAt===null,'no deletion scheduled by default')

await B.req('POST','/api/auth/register',{email:'b@x.io',username:'bob',displayName:'Bob',password:'password-b1'})
me=await B.req('GET','/api/auth/me')
ok(me.json.user.verified===false,'normal user is NOT verified')

// verified cannot be self-granted: /me PATCH ignores it
await B.req('PATCH','/api/me',{displayName:'Bob',verified:true,role:'admin'})
me=await B.req('GET','/api/auth/me')
ok(me.json.user.verified===false&&me.json.user.role==='user','user cannot self-grant verified/role via profile edit')

// verified appears in search + chat serialization
const s=await B.req('GET','/api/users/search?q=alice')
ok(s.json.users[0].verified===true,'verified flag present in search results')
const chat=await B.req('POST','/api/chats',{userId:me.json.user.id?undefined:undefined}||{})
const alice=(await B.req('GET','/api/users/alice')).json.user
const c=await B.req('POST','/api/chats',{userId:alice.id})
ok(c.json.chat.peer.verified===true,'verified flag present on chat peer')

// scheduled deletion
const periods=await A.req('GET','/api/me/deletion-periods')
ok(JSON.stringify(periods.json.months)==='[1,3,6,12,18,24]','deletion periods exposed')
let sd=await A.req('POST','/api/me/schedule-deletion',{months:5})
ok(sd.status===400,'invalid period rejected')
sd=await A.req('POST','/api/me/schedule-deletion',{months:3})
ok(sd.status===200&&sd.json.deleteScheduledAt,'schedule deletion 3 months accepted')
me=await A.req('GET','/api/auth/me')
const days=Math.round((new Date(me.json.user.deleteScheduledAt)-Date.now())/86400000)
ok(days>=88&&days<=92,'scheduled date ~90 days out and shown in profile ('+days+'d)')
// still fully usable
ok((await A.req('GET','/api/chats')).status===200,'account still usable during scheduled window')
// cancel
await A.req('DELETE','/api/me/schedule-deletion')
me=await A.req('GET','/api/auth/me')
ok(me.json.user.deleteScheduledAt===null,'scheduled deletion cancelled')

// immediate deletion needs correct password
let del=await B.req('POST','/api/me/delete',{password:'wrong'})
ok(del.status===400,'immediate delete rejects wrong password')
// upload a file first so we can prove the file is removed
const form=new FormData(); form.append('file',new Blob([new Uint8Array(50).fill(66)],{type:'image/png'}),'x.png')
const up=await B.req('POST','/api/chats/'+c.json.chat.id+'/messages',null,form)
const fname=up.json.message.attachment.url.split('/').pop()
const onDisk=()=>fs.existsSync(path.join(tmp,'up',fname))
ok(onDisk(),'uploaded file exists on disk before deletion')
del=await B.req('POST','/api/me/delete',{password:'password-b1'})
ok(del.status===200,'immediate delete with correct password succeeds')
ok(!onDisk(),'uploaded file physically removed from disk')
const gone=await B.req('GET','/api/auth/me')
ok(gone.status===401,'deleted user session invalidated')
const relog=await B.req('POST','/api/auth/login',{identifier:'bob',password:'password-b1'})
ok(relog.status===400,'deleted user cannot log back in')
// alice's chat with bob is gone (private chat deleted)
ok((await A.req('GET','/api/chats')).json.chats.length===0,"deleted user's private chats removed for both sides")
// bob no longer searchable
ok((await A.req('GET','/api/users/search?q=bob')).json.users.length===0,'deleted user not searchable')

// verified badge removed when role revoked: make bob-like check via alice demotion
// (promote a 2nd user then demote)
const C=client(); await C.req('POST','/api/auth/register',{email:'c@x.io',username:'carol',displayName:'Carol',password:'password-c1'})
const carol=(await A.req('GET','/api/admin/users?q=carol')).json.users[0]
await A.req('PATCH','/api/admin/users/'+carol.id,{role:'admin'})
ok((await A.req('GET','/api/users/carol')).json.user.verified===true,'promoted admin shows verified')
await A.req('PATCH','/api/admin/users/'+carol.id,{role:'user'})
ok((await A.req('GET','/api/users/carol')).json.user.verified===false,'verified removed when admin role revoked')

srv.kill(); await wait(200)
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0)
