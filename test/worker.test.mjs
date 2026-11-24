import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,verify,createHmac} from 'node:crypto';
import {createWorker} from '../src/worker.mjs';
import {googleAccessToken,googleSynthesize} from '../src/google.mjs';
import {billingMonth} from '../src/limits.mjs';
import {splitText,joinWav} from '../src/audio.mjs';

const KEY='a'.repeat(64),IP_KEY='b'.repeat(64),time=Date.parse('2026-11-24T12:00:00Z');
const schema=readFileSync(new URL('../migrations/0001_usage.sql',import.meta.url),'utf8');
// 実際のSQLをSQLiteで実行し、D1バッチのトランザクションと応答形式を模倣する。
// D1本番環境やMiniflareを使用する統合テストではない。
function dbFixture(sqlite=new DatabaseSync(':memory:')){
  sqlite.exec(schema);
  const db={prepare(sql){return {bind(...values){return {sql,values,async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){return {success:true,meta:{changes:sqlite.prepare(sql).run(...values).changes}};}}}};},async batch(stmts){sqlite.exec('BEGIN IMMEDIATE');try{const results=stmts.map(({sql,values})=>{const stmt=sqlite.prepare(sql);if(/^\s*SELECT/i.test(sql))return {success:true,results:stmt.all(...values),meta:{changes:0}};return {success:true,results:[],meta:{changes:stmt.run(...values).changes}};});sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  return {db,sqlite};
}
function fixture(options={},envOverrides={}){
  const {db,sqlite}=dbFixture(),calls=[];
  const env={DB:db,TTS_ADMIN_BYPASS_KEY:KEY,TTS_IP_HASH_KEY:IP_KEY,ASSETS:{fetch:()=>new Response('static')},...envOverrides};
  const worker=createWorker({now:()=>time,authorize:async()=>({token:'test',project:'test'}),synthesize:async(...args)=>{calls.push(args);return Buffer.from('mp3');},...options});
  const post=(text,{key,ip='192.0.2.1',query='',headers={}}={})=>worker.fetch(new Request('https://test.example/api/tts'+query,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...(key!==undefined?{'X-TTS-Bypass':key}:{}),...headers},body:JSON.stringify({text})}),env);
  const usage=(key=KEY)=>worker.fetch(new Request('https://test.example/api/tts/usage',{headers:{'X-TTS-Bypass':key}}),env).then(r=>r.json());
  return {worker,env,sqlite,calls,post,usage};
}
test('static assets, text, default voice and validation',async()=>{const f=fixture();assert.equal(await(await f.worker.fetch(new Request('https://test.example/'),f.env)).text(),'static');assert.equal((await f.post('')).status,400);assert.equal((await f.post('a',{headers:{Origin:'https://other.example'}})).status,403);assert.equal((await f.post('a',{headers:{'Content-Type':'text/plain'}})).status,415);assert.equal((await f.post('Hello!')).status,200);assert.deepEqual(f.calls[0].slice(0,3),['Hello!','MP3','en-US-Chirp3-HD-Aoede']);assert.equal((await f.usage()).used,6);});
test('per-IP limit, independent users, raw query not authorization, admin bypass, window expiration',async()=>{let t=time;const f=fixture({now:()=>t},{TTS_IP_REQUESTS_PER_MINUTE:'1'});assert.equal((await f.post('abc')).status,200);let r=await f.post('x');assert.equal(r.status,429);assert.equal((await r.json()).code,'RATE_LIMIT');assert.equal((await f.post('x',{query:`?bypass=${KEY}`})).status,429);assert.equal((await f.post('x',{headers:{'X-Forwarded-For':'192.0.2.2'}})).status,429);assert.equal((await f.post('x',{key:'bad'})).status,403);assert.equal((await f.post('x',{ip:'192.0.2.2'})).status,200);assert.equal((await f.post('x',{key:KEY})).status,200);t+=60001;assert.equal((await f.post('x')).status,200);assert.equal((await f.usage()).used,6);});
test('byte limit independent of character limit',async()=>{const f=fixture({},{TTS_IP_BYTES_PER_MINUTE:'4'});assert.equal((await f.post('😀')).status,200);assert.equal((await f.post('a')).status,429);assert.equal((await f.post('abcde',{key:KEY})).status,200);});
test('1,000 codepoint cap cannot be bypassed; punctuation and whitespace counted',async()=>{const f=fixture();assert.equal((await f.post('a'.repeat(1001),{key:KEY})).status,413);assert.equal((await f.usage()).used,0);assert.equal((await f.post('Hi, 😀!')).status,200);assert.equal((await f.usage()).used,6);assert.equal((await f.post('a'.repeat(1000),{key:KEY})).status,200);});
test('monthly cap and external chars, same D1 across concurrent Worker invocations',async()=>{const f=fixture({},{TTS_MONTHLY_CHAR_LIMIT:'12',TTS_EXTERNAL_MONTHLY_CHARS:'2'});const result=await Promise.all([f.post('abcdef',{key:KEY}),f.post('abcdef',{ip:'192.0.2.2'})]);assert.deepEqual(result.map(r=>r.status).sort(),[200,429]);assert.equal((await f.usage()).used,6);assert.equal((await f.post('abcd',{key:KEY})).status,200);const r=await f.post('a',{key:KEY});assert.equal((await r.json()).code,'MONTHLY_LIMIT');assert.equal(f.calls.length,2);});
test('no global or concurrent synthesis limit',async()=>{let started=0,release;const gate=new Promise(r=>release=r);const f=fixture({synthesize:async()=>{started++;await gate;return Buffer.from('mp3');}},{TTS_IP_REQUESTS_PER_MINUTE:'1'});const pending=Array.from({length:30},(_,i)=>f.post('x',{ip:`192.0.2.${i+1}`}));try{for(let i=0;i<100&&started<30;i++)await new Promise(r=>setTimeout(r,5));assert.equal(started,30);}finally{release();}assert.ok((await Promise.all(pending)).every(r=>r.status===200));});
test('D1 outage fails closed, rejected requests never synthesize',async()=>{const f=fixture();f.env.DB={prepare:()=>{throw Error('offline');}};const r=await f.post('abc');assert.equal(r.status,503);assert.equal((await r.json()).code,'USAGE_UNAVAILABLE');assert.equal(f.calls.length,0);});
test('Google failures retain quota; fresh month does not reuse old count; rollover guard',async()=>{let t=Date.parse('2026-12-01T07:50:00Z'),fail=true;const f=fixture({now:()=>t,synthesize:async()=>{if(fail)throw Object.assign(new Error('mock'),{googleStatus:500});return Buffer.from('mp3');}},{TTS_MONTHLY_CHAR_LIMIT:'5'});assert.equal(billingMonth(t),'2026-11');assert.equal((await f.post('hello')).status,502);assert.equal((await f.usage()).used,5);assert.equal((await f.post('x',{key:KEY})).status,429);t=Date.parse('2026-12-01T07:59:00Z');assert.equal((await f.post('x',{key:KEY})).status,503);t=Date.parse('2026-12-01T08:00:01Z');fail=false;assert.equal((await f.post('hello')).status,200);assert.equal((await f.usage()).used,5);});
test('monthly usage persists across new Worker instances',async()=>{const f=fixture();await f.post('12345');const w=createWorker({now:()=>time});const r=await w.fetch(new Request('https://test.example/api/tts/usage',{headers:{'X-TTS-Bypass':KEY}}),f.env);assert.equal((await r.json()).used,5);});
test('zero cap, wrong voice, invalid admin key configuration fail closed',async()=>{assert.equal((await fixture({},{TTS_MONTHLY_CHAR_LIMIT:'0'}).post('a')).status,429);assert.equal((await fixture({},{GOOGLE_TTS_VOICE:'en-US-Studio-O'}).post('a')).status,503);assert.equal((await fixture({},{TTS_ADMIN_BYPASS_KEY:'short'}).post('a')).status,503);});
test('Google JWT signed with RS256, fixed token endpoint, bearer request and cached token',async()=>{const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const env={GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'test@example.iam.gserviceaccount.com',private_key:privateKey.export({format:'pem',type:'pkcs8'}),project_id:'test-project'}),GOOGLE_CLOUD_PROJECT:'test-project'};let tokens=0;const fetcher=async(url,opts)=>{if(url.includes('oauth2')){tokens++;const [a,b,s]=opts.body.get('assertion').split('.');const claims=JSON.parse(Buffer.from(b,'base64url'));assert.equal(claims.aud,'https://oauth2.googleapis.com/token');assert.equal(claims.iss,'test@example.iam.gserviceaccount.com');assert.equal(verify('RSA-SHA256',Buffer.from(`${a}.${b}`),publicKey,Buffer.from(s,'base64url')),true);return Response.json({access_token:'token',expires_in:3600});}assert.equal(url,'https://texttospeech.googleapis.com/v1/text:synthesize');assert.equal(opts.headers.Authorization,'Bearer token');assert.equal(opts.headers['x-goog-user-project'],'test-project');assert.equal(JSON.parse(opts.body).input.text,'Hello');return Response.json({audioContent:Buffer.from('audio').toString('base64')});};const auth=await googleAccessToken(env,{fetcher,now:()=>time});await googleAccessToken(env,{fetcher,now:()=>time+1000});assert.equal(tokens,1);assert.equal((await googleSynthesize('Hello','MP3','en-US-Chirp3-HD-Aoede',auth,{fetcher})).toString(),'audio');});
test('UTF-8 splitting and WAV joining',()=>{const s='hello '.repeat(1000)+'😀';const chunks=splitText(s);assert.ok(chunks.length>1&&chunks.every(x=>Buffer.byteLength(x)<=5000));assert.equal(chunks.join('').replace(/\s/g,''),s.replace(/\s/g,''));const wave=n=>{const b=Buffer.alloc(46);b.write('RIFF');b.writeUInt32LE(38,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(2,40);b.writeInt16LE(n,44);return b;};const w=joinWav([wave(1),wave(2)]);assert.equal(w.readUInt32LE(40),4);assert.deepEqual([w.readInt16LE(44),w.readInt16LE(46)],[1,2]);});

// 生のIPや英文が保存されず、秘密鍵付きの識別子だけが記録されることを確認する。
test('IP識別子のHMAC化・管理者IPの非保存',async()=>{
 const f=fixture();const text='private sentence';const ip='192.0.2.1';
 assert.equal((await f.post(text,{ip})).status,200);
 assert.equal((await f.post(text,{ip:'192.0.2.2'})).status,200);
 assert.equal((await f.post(text,{ip,key:KEY})).status,200);
 const rows=f.sqlite.prepare('SELECT * FROM admissions ORDER BY rowid').all();
 assert.equal(rows[0].client,createHmac('sha256',Buffer.from(IP_KEY,'hex')).update(ip).digest('hex'));
 assert.equal(rows[0].client.length,64);assert.notEqual(rows[0].client,rows[1].client);
 assert.equal(rows[2].client,'admin');assert.ok(!JSON.stringify(rows).includes(ip));assert.ok(!JSON.stringify(rows).includes(text));
 const g=fixture({},{TTS_IP_HASH_KEY:'c'.repeat(64)});await g.post(text,{ip});
 assert.notEqual(g.sqlite.prepare('SELECT client FROM admissions').get().client,rows[0].client);
});
test('IP秘密鍵が未設定または不正な場合は生成を停止',async()=>{
 for(const secret of [undefined,'','short','z'.repeat(64)]){
  const f=fixture({},{TTS_IP_HASH_KEY:secret});
  assert.equal((await f.post('hello')).status,503);assert.equal((await f.post('hello',{key:KEY})).status,503);
  assert.equal(f.calls.length,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM admissions').get().n,0);
 }
});
test('定期削除で期限切れのIP記録のみ消去し、月間集計を維持',async()=>{
 let t=time;const f=fixture({now:()=>t});await f.post('hello');t+=30000;await f.post('world');
 t+=30000;await f.worker.scheduled({},f.env);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM admissions').get().n,1);assert.equal((await f.usage()).used,10);
 t+=30000;await f.worker.scheduled({},f.env);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM admissions').get().n,0);assert.equal((await f.usage()).used,10);
});
