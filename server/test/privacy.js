const PORT=3196, BASE=`http://localhost:${PORT}`
import { spawn } from 'node:child_process'
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
import { io } from 'socket.io-client'
const dir=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const tmp='/tmp/priv-data'; fs.rmSync(tmp,{recursive:true,force:true}); fs.mkdirSync(tmp,{recursive:true})
let pass=0,fail=0; const ok=(c,n)=>{c?(pass++,console.log('  ✓',n)):(fail++,console.error('  ✗ FAIL',n))}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
function cl(){let ck=null;return{get cookie(){return ck},async req(m,p,b){const r=await fetch(BASE+p,{method:m,headers:{...(ck?{cookie:ck}:{}),...(b?{'content-type':'application/json'}:{})},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j}}}}
function once(sock,ev,to=3000){return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout '+ev)),to);sock.once(ev,d=>{clearTimeout(t);res(d)})})}
const srv=spawn(process.execPath,['src/index.js'],{cwd:dir,env:{...process.env,PORT:String(PORT),DATA_DIR:tmp,UPLOADS_DIR:path.join(tmp,'up'),DB_PATH:path.join(tmp,'t.db')},stdio:['ignore','pipe','pipe']})
srv.stderr.on('data',d=>process.stderr.write('[srv] '+d))
for(let i=0;i<50;i++){try{if((await fetch(BASE+'/health')).ok)break}catch{}await wait(100)}

const A=cl(),B=cl(),C=cl()  // A=owner(admin), B=normal, C=normal stranger
await A.req('POST','/api/auth/register',{email:'a@x.io',username:'anna',displayName:'Anna',password:'password-a1'})
await B.req('POST','/api/auth/register',{email:'b@x.io',username:'ben',displayName:'Ben',password:'password-b1'})
await C.req('POST','/api/auth/register',{email:'c@x.io',username:'cara',displayName:'Cara',password:'password-c1'})
const anna=(await B.req('GET','/api/users/anna')).json.user
const annaId=anna.id
// B connects a socket so B is "online"
const bSock=io(BASE,{extraHeaders:{cookie:B.cookie}}); await once(bSock,'connect')

// default: everyone sees online
ok((await A.req('GET','/api/users/ben')).json.user.online===true,'default: online visible to everyone')
ok((await A.req('GET','/api/auth/me')).json.user.privacy.online==='everyone','me exposes privacy settings')

// B hides online → nobody
await B.req('PATCH','/api/me/privacy',{online:'nobody'})
ok((await A.req('GET','/api/users/ben')).json.user.online===false,'online=nobody hides online from others (API-enforced)')
// B hides last seen → nobody: API must not leak timestamp
bSock.close(); await wait(300)
await B.req('PATCH','/api/me/privacy',{lastSeen:'nobody'})
let p=(await A.req('GET','/api/users/ben')).json.user
ok(p.lastSeenAt===null,'lastSeen=nobody: exact timestamp never sent')
ok(p.lastSeenLabel==='last seen recently','lastSeen=nobody: coarse fallback label shown')

// coarse mode: this week
await B.req('PATCH','/api/me/privacy',{lastSeen:'everyone',lastSeenMode:'week'})
p=(await A.req('GET','/api/users/ben')).json.user
ok(p.lastSeenAt===null&&/within a week/.test(p.lastSeenLabel||''),'lastSeenMode=week returns coarse label, not timestamp')
// exact mode restores timestamp
await B.req('PATCH','/api/me/privacy',{lastSeenMode:'exact'})
p=(await A.req('GET','/api/users/ben')).json.user
ok(!!p.lastSeenAt&&!p.lastSeenLabel,'lastSeenMode=exact returns real timestamp')

// photo + bio contacts-only
await B.req('PATCH','/api/me',{bio:'secret bio'})
await B.req('PATCH','/api/me/privacy',{bio:'contacts',photo:'contacts'})
ok((await C.req('GET','/api/users/ben')).json.user.bio==='','bio=contacts hidden from non-contact')
// B adds C as contact → C can see bio
await B.req('POST','/api/contacts',{userId:(await B.req('GET','/api/users/cara')).json.user.id})
ok((await C.req('GET','/api/users/ben')).json.user.bio==='secret bio','bio=contacts visible to a contact')

// invalid values rejected
ok((await B.req('PATCH','/api/me/privacy',{online:'friends'})).status===400,'invalid privacy value rejected')

// calls privacy: B blocks calls from non-contacts (nobody), C tries to call
await B.req('PATCH','/api/me/privacy',{calls:'nobody'})
const b2=io(BASE,{extraHeaders:{cookie:B.cookie}}); await once(b2,'connect')
const cSock=io(BASE,{extraHeaders:{cookie:C.cookie}}); await once(cSock,'connect')
const cbChat=(await C.req('POST','/api/chats',{userId:(await C.req('GET','/api/users/ben')).json.user.id})).json.chat.id
const callRes=await new Promise(r=>cSock.emit('call:invite',{chatId:cbChat,video:false,offer:{}},r))
ok(/doesn.t accept calls/.test(callRes.error||''),'calls=nobody rejects incoming call server-side')

// typing indicator off: B disables, A shouldn't get typing
await B.req('PATCH','/api/me/privacy',{typingIndicator:false})
const abChat=(await A.req('POST','/api/chats',{userId:annaId?undefined:undefined})||{})&&(await B.req('POST','/api/chats',{userId:annaId})).json.chat.id
const aSock=io(BASE,{extraHeaders:{cookie:A.cookie}}); await once(aSock,'connect')
let gotTyping=false; aSock.on('typing',()=>gotTyping=true)
b2.emit('typing',{chatId:abChat,on:true}); await wait(400)
ok(gotTyping===false,'typingIndicator=off suppresses typing events')
await B.req('PATCH','/api/me/privacy',{typingIndicator:true})
b2.emit('typing',{chatId:abChat,on:true})
ok(!!(await once(aSock,'typing').catch(()=>null)),'typingIndicator=on relays typing')

// read receipts off: B reads A's message, A should NOT get readUpTo
await B.req('PATCH','/api/me/privacy',{readReceipts:false})
const msg=(await A.req('POST','/api/chats/'+abChat+'/messages',{body:'hi ben'})).json.message
const recP=once(aSock,'receipt',2500)
await B.req('POST','/api/chats/'+abChat+'/read',{messageId:msg.id})
const rec=await recP.catch(()=>({}))
ok(rec.readUpTo===null&&rec.deliveredUpTo===msg.id,'readReceipts=off: delivered sent but read hidden')

// admin override: A (owner) sees real online + sessions/platform/ip even though B hid everything
const sec=await A.req('GET','/api/admin/users/'+annaId.replace(annaId,(await A.req('GET','/api/admin/users?q=ben')).json.users[0].id)+'/security')
ok(sec.status===200&&typeof sec.json.online==='boolean','admin security detail returns real online status')
ok(sec.json.sessions.length>=1&&sec.json.sessions[0].platform,'admin sees session platform info')
ok('ip' in sec.json.sessions[0],'admin sees session IP field')
const adminList=await A.req('GET','/api/admin/users?q=ben')
ok('realLastSeenAt' in adminList.json.users[0],'admin list exposes real last seen (override)')

// normal user cannot access admin override
ok((await C.req('GET','/api/admin/users/'+annaId+'/security')).status===403,'normal user denied admin security endpoint')

bSock.close?.();b2.close();cSock.close();aSock.close();srv.kill();await wait(200)
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0)
