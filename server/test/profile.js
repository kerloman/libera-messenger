const PORT=3197, BASE=`http://localhost:${PORT}`
import { spawn } from 'node:child_process'
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const dir=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const tmp='/tmp/prof-data'; fs.rmSync(tmp,{recursive:true,force:true}); fs.mkdirSync(tmp,{recursive:true})
let pass=0,fail=0; const ok=(c,n)=>{c?(pass++,console.log('  ✓',n)):(fail++,console.error('  ✗ FAIL',n))}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
function cl(){let ck=null;return{async req(m,p,b,f){const r=await fetch(BASE+p,{method:m,headers:{...(ck?{cookie:ck}:{}),...(b&&!f?{'content-type':'application/json'}:{})},body:f?f:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j}}}}
const srv=spawn(process.execPath,['src/index.js'],{cwd:dir,env:{...process.env,PORT:String(PORT),DATA_DIR:tmp,UPLOADS_DIR:path.join(tmp,'up'),DB_PATH:path.join(tmp,'t.db')},stdio:['ignore','pipe','pipe']})
srv.stderr.on('data',d=>process.stderr.write('[srv] '+d))
for(let i=0;i<50;i++){try{if((await fetch(BASE+'/health')).ok)break}catch{}await wait(100)}

const A=cl(),B=cl()
await A.req('POST','/api/auth/register',{email:'a@x.io',username:'anna',displayName:'Anna',password:'password-a1'})
await B.req('POST','/api/auth/register',{email:'b@x.io',username:'ben',displayName:'Ben',password:'password-b1'})
const ben=(await A.req('GET','/api/users/ben')).json.user
const c=await A.req('POST','/api/chats',{userId:ben.id}); const chatId=c.json.chat.id
ok(c.json.chat.muted===false,'chat starts unmuted')

// contacts
ok((await A.req('GET','/api/users/ben')).json.user.isContact===false,'ben not a contact initially')
await A.req('POST','/api/contacts',{userId:ben.id})
ok((await A.req('GET','/api/users/ben')).json.user.isContact===true,'add to contacts works')
ok((await A.req('GET','/api/contacts')).json.contacts[0].username==='ben','contact appears in list')
await A.req('DELETE','/api/contacts/'+ben.id)
ok((await A.req('GET','/api/users/ben')).json.user.isContact===false,'remove from contacts works')

// shared media
const mk=(kind,mime,name)=>{const f=new FormData();f.append('file',new Blob([new Uint8Array(30).fill(1)],{type:mime}),name);if(kind)f.append('kind',kind);return f}
await A.req('POST','/api/chats/'+chatId+'/messages',null,mk(null,'image/png','p.png'))
await A.req('POST','/api/chats/'+chatId+'/messages',null,mk(null,'video/mp4','v.mp4'))
await A.req('POST','/api/chats/'+chatId+'/messages',null,mk('voice','audio/webm','a.webm'))
await A.req('POST','/api/chats/'+chatId+'/messages',null,mk(null,'application/pdf','d.pdf'))
await A.req('POST','/api/chats/'+chatId+'/messages',{body:'check https://libera.app and https://x.com'})
const media=(await A.req('GET','/api/chats/'+chatId+'/media')).json
ok(media.counts.photos===1&&media.counts.videos===1&&media.counts.voice===1&&media.counts.files===1,'shared content categorised (photo/video/voice/file)')
ok(media.counts.links===1&&media.media.links[0].urls.length===2,'links extracted from messages')

// mute
await A.req('POST','/api/chats/'+chatId+'/mute',{muted:true})
ok((await A.req('GET','/api/chats')).json.chats.find(x=>x.id===chatId).muted===true,'mute persists in chat list')
await A.req('POST','/api/chats/'+chatId+'/mute',{muted:false})
ok((await A.req('GET','/api/chats')).json.chats.find(x=>x.id===chatId).muted===false,'unmute works')

// clear history
await A.req('POST','/api/chats/'+chatId+'/clear')
ok((await A.req('GET','/api/chats/'+chatId+'/messages')).json.messages.length===0,'clear history empties messages')
ok((await A.req('GET','/api/chats')).json.chats.some(x=>x.id===chatId),'chat still exists after clearing')

// block enforcement
await A.req('POST','/api/blocks',{userId:ben.id})
ok((await A.req('GET','/api/users/ben')).json.user.blockedByMe===true,'block reflected in profile')
ok((await B.req('POST','/api/chats/'+chatId+'/messages',{body:'hi'})).status===403,'blocked user cannot send message')
ok((await A.req('POST','/api/chats/'+chatId+'/messages',{body:'hi'})).status===403,'blocker also cannot message blocked user')
ok((await B.req('GET','/api/users/search?q=anna')).json.users.length===0,'blocked user hidden from search')
ok((await A.req('GET','/api/users/ben')).json.user.online===false,'presence hidden while blocked')
await A.req('DELETE','/api/blocks/'+ben.id)
ok((await A.req('POST','/api/chats/'+chatId+'/messages',{body:'hi again'})).status===200,'messaging works after unblock')

// delete chat
await A.req('DELETE','/api/chats/'+chatId)
ok((await A.req('GET','/api/chats')).json.chats.every(x=>x.id!==chatId),'delete chat removes it for me')
ok((await B.req('GET','/api/chats')).json.chats.every(x=>x.id!==chatId),'delete chat removes it for peer too')

srv.kill(); await wait(200)
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0)
