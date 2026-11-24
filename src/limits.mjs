const FREE_CHARS=1_000_000;
const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'});
const encoder=new TextEncoder();
export function billingMonth(time){const p=Object.fromEntries(formatter.formatToParts(new Date(time)).map(v=>[v.type,v.value]));return `${p.year}-${p.month}`;}
export function httpError(status,message,code,retryAfter){return Object.assign(new Error(message),{status,code,retryAfter});}
function integer(env,name,fallback,min=1,max=Number.MAX_SAFE_INTEGER){const n=Number(env[name]??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`Invalid ${name}`);return n;}
export function configFromEnv(env){
  // IP識別子の生成には32バイトの秘密鍵を必須とし、未設定時は音声生成を停止する。
  if(typeof env.TTS_IP_HASH_KEY!=='string'||! /^[0-9a-f]{64}$/i.test(env.TTS_IP_HASH_KEY))throw new Error('Invalid TTS_IP_HASH_KEY');
  const adminKey=env.TTS_ADMIN_BYPASS_KEY||'';
  if(adminKey&&(typeof adminKey!=='string'||adminKey.length<32))throw new Error('Invalid TTS_ADMIN_BYPASS_KEY');
  const monthly=integer(env,'TTS_MONTHLY_CHAR_LIMIT',950000,0,FREE_CHARS),externalChars=integer(env,'TTS_EXTERNAL_MONTHLY_CHARS',0,0,FREE_CHARS);
  const voice=env.GOOGLE_TTS_VOICE||'en-US-Chirp3-HD-Aoede';
  if(!/^en-US-Chirp3-HD-[A-Za-z0-9-]+$/.test(voice))throw new Error('Only en-US Chirp 3: HD is allowed');
  return {adminKey,voice,externalChars,limit:Math.max(0,monthly-externalChars),maxRequestChars:integer(env,'TTS_MAX_CHARS_PER_REQUEST',1000,1,6000),ipRate:integer(env,'TTS_IP_REQUESTS_PER_MINUTE',5),ipBytes:integer(env,'TTS_IP_BYTES_PER_MINUTE',10000)};
}
async function digest(s){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)));}
export async function checkAdmin(req,c){
  const supplied=req.headers.get('X-TTS-Bypass');
  if(supplied===null)return false;
  if(!c.adminKey||supplied.length>1024)throw httpError(403,'管理者キーが正しくありません。','INVALID_ADMIN_KEY');
  const a=await digest(supplied),b=await digest(c.adminKey);let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  if(diff!==0)throw httpError(403,'管理者キーが正しくありません。','INVALID_ADMIN_KEY');
  return true;
}
async function clientID(req,env){
  // Cloudflareが付与する接続元IPのみを使用し、利用者が指定できるX-Forwarded-Forは信頼しない。
  const ip=req.headers.get('CF-Connecting-IP')||'unknown';
  // 秘密鍵付きHMACでIPを識別子に変換し、生のIPはデータベースやログへ渡さない。
  const keyBytes=Uint8Array.from(env.TTS_IP_HASH_KEY.match(/../g),h=>parseInt(h,16));
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(ip)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
const rateError=()=>httpError(429,'音声生成の利用上限に達しました。1分ほどおいて再試行してください。','RATE_LIMIT',60);
const monthError=()=>httpError(429,'今月の無料音声生成枠に達しました。英文の解析は引き続き利用できます。','MONTHLY_LIMIT');
const dbError=()=>httpError(503,'使用量を確認できないため音声生成を停止しています。','USAGE_UNAVAILABLE');
const rolloverError=()=>httpError(503,'月間利用枠を切り替えています。数分おいて再試行してください。','MONTH_ROLLOVER',120);
export function beforeDispatch(reservation,time=Date.now()){
  if(billingMonth(time)!==reservation.month||billingMonth(time+120000)!==reservation.month)throw rolloverError();
}
export async function reserve(req,env,c,chunks,admin,time=Date.now()){
  const month=billingMonth(time),boundary=time-60000;
  beforeDispatch({month},time);
  const id=crypto.randomUUID(),client=admin?'admin':await clientID(req,env),calls=chunks.length,bytes=chunks.reduce((s,t)=>s+encoder.encode(t).length,0),chars=chunks.reduce((s,t)=>s+[...t].length,0);
  const db=env.DB;
  let results;
  try {
    // D1のバッチを一つのトランザクションとして実行し、判定と加算の競合を防ぐ。
    // 拒否されたリクエストは月間使用量に加算しない。
    results=await db.batch([
      db.prepare('DELETE FROM admissions WHERE id IN (SELECT id FROM admissions WHERE ts<=? ORDER BY ts LIMIT 1000)').bind(boundary),
      db.prepare(`INSERT INTO admissions(id,ts,client,admin,calls,bytes,month,chars)
        SELECT ?,?,?,?,?,?,?,?
        WHERE COALESCE((SELECT chars FROM monthly_usage WHERE month=?),0)+?<=?
        AND (?=1 OR (
          COALESCE((SELECT SUM(calls) FROM admissions WHERE admin=0 AND client=? AND ts>?),0)+?<=?
          AND COALESCE((SELECT SUM(bytes) FROM admissions WHERE admin=0 AND client=? AND ts>?),0)+?<=?
        ))`).bind(id,time,client,Number(admin),calls,bytes,month,chars,month,chars,c.limit,Number(admin),client,boundary,calls,c.ipRate,client,boundary,bytes,c.ipBytes),
      db.prepare(`INSERT INTO monthly_usage(month,chars) SELECT month,chars FROM admissions WHERE id=?
        ON CONFLICT(month) DO UPDATE SET chars=monthly_usage.chars+excluded.chars`).bind(id),
      db.prepare('SELECT COALESCE((SELECT chars FROM monthly_usage WHERE month=?),0) AS used').bind(month)
    ]);
  }catch{throw dbError();}
  if(!Array.isArray(results)||results.length!==4||results.some(r=>r.success!==true))throw dbError();
  const changes=results[1].meta?.changes, increment=results[2].meta?.changes, used=results[3].results?.[0]?.used;
  if(!Number.isSafeInteger(used)||![0,1].includes(changes)||increment!==changes)throw dbError();
  if(changes===0){if(used+chars>c.limit)throw monthError();throw rateError();}
  return {month,chars};
}
// レート制限の判定に不要となった記録を削除する。月間集計は保持する。
export async function purgeExpiredAdmissions(env,time=Date.now()){
  const result=await env.DB.prepare('DELETE FROM admissions WHERE ts<=?').bind(time-60000).run();
  if(result?.success!==true)throw dbError();
}
export async function usage(env,c,time=Date.now()){
  const month=billingMonth(time);let row;
  try{row=await env.DB.prepare('SELECT COALESCE((SELECT chars FROM monthly_usage WHERE month=?),0) AS used').bind(month).first();}catch{throw dbError();}
  if(!Number.isSafeInteger(row?.used))throw dbError();
  return {month,timezone:'America/Los_Angeles',used:row.used,limit:c.limit,remaining:Math.max(0,c.limit-row.used),googleFreeLimit:FREE_CHARS,externalChars:c.externalChars};
}
