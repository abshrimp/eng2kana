import { Buffer } from 'node:buffer';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const SYNTH_URL='https://texttospeech.googleapis.com/v1/text:synthesize';
const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
let tokenCache;
function googleError(status){return Object.assign(new Error('Google Cloud request failed'),{googleStatus:status});}
function credentials(env){
  let key;try{key=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'');}catch{throw googleError(403);}
  if(key.type!=='service_account'||typeof key.client_email!=='string'||typeof key.private_key!=='string'||!key.private_key.includes('BEGIN PRIVATE KEY'))throw googleError(403);
  const project=env.GOOGLE_TTS_QUOTA_PROJECT||env.GOOGLE_CLOUD_PROJECT||key.project_id;
  if(!project||project==='YOUR_GOOGLE_PROJECT_ID')throw googleError(403);
  return {key,project};
}
export async function googleAccessToken(env,{fetcher=fetch,now=Date.now}={}){
  const {key,project}=credentials(env);
  const current=Math.floor(now()/1000);
  // 取得済みのトークンだけをキャッシュし、処理中のPromiseをリクエスト間で共有しない。
  if(tokenCache?.secret===env.GOOGLE_SERVICE_ACCOUNT_JSON&&tokenCache.expiry>current+120)return {token:tokenCache.token,project};
  const der=Buffer.from(key.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,''),'base64');
  const privateKey=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const jwt=`${encode({alg:'RS256',typ:'JWT',...(key.private_key_id?{kid:key.private_key_id}:{})})}.${encode({iss:key.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:TOKEN_URL,iat:current,exp:current+3600})}`;
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(jwt));
  const assertion=`${jwt}.${Buffer.from(signature).toString('base64url')}`;
  const res=await fetcher(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000),redirect:'manual'});
  if(!res.ok)throw googleError(res.status);
  const data=await res.json();
  if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw googleError(502);
  tokenCache={secret:env.GOOGLE_SERVICE_ACCOUNT_JSON,token:data.access_token,expiry:current+Math.min(3600,Number(data.expires_in))};
  return {token:data.access_token,project};
}
export async function googleSynthesize(text,audioEncoding,voice,auth,{fetcher=fetch}={}){
  const res=await fetcher(SYNTH_URL,{method:'POST',headers:{Authorization:`Bearer ${auth.token}`,'x-goog-user-project':auth.project,'Content-Type':'application/json'},body:JSON.stringify({input:{text},voice:{languageCode:'en-US',name:voice},audioConfig:{audioEncoding}}),signal:AbortSignal.timeout(90000),redirect:'manual'});
  if(!res.ok)throw googleError(res.status);
  const data=await res.json();
  if(typeof data.audioContent!=='string'||!data.audioContent)throw googleError(502);
  const audio=Buffer.from(data.audioContent,'base64');
  if(!audio.length)throw googleError(502);
  return audio;
}
