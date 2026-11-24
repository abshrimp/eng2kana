import {splitText,joinWav} from './audio.mjs';
import {configFromEnv,checkAdmin,reserve,beforeDispatch,usage,httpError,purgeExpiredAdmissions} from './limits.mjs';
import {googleAccessToken,googleSynthesize} from './google.mjs';
const MAX_BODY=65536;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function json(status,data,extra={}){return Response.json(data,{status,headers:{...headers,...extra}});}
function error(status,message,code,retryAfter){return json(status,{error:message,...(code?{code}:{})},retryAfter?{'Retry-After':String(retryAfter)}:{});}
async function readJson(req){
  if(Number(req.headers.get('Content-Length'))>MAX_BODY)throw httpError(413,'入力が長すぎます。');
  const reader=req.body?.getReader();if(!reader)throw httpError(400,'入力形式が正しくありません。');
  const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,raw='';
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel().catch(()=>{});throw httpError(413,'入力が長すぎます。');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();return JSON.parse(raw);}
  catch(e){if(e.status)throw e;throw httpError(400,'入力形式が正しくありません。');}finally{reader.releaseLock();}
}
export function createWorker({authorize=googleAccessToken,synthesize=googleSynthesize,now=Date.now}={}){
  return {
    // アクセスがない場合も、定期処理で期限切れのIP別記録を削除する。
    async scheduled(_controller,env){await purgeExpiredAdmissions(env,now());},
    async fetch(req,env){
    const url=new URL(req.url),path=url.pathname;
    if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
    try{
      const c=configFromEnv(env);
      if(path==='/api/tts/usage'){
        if(req.method!=='GET')return json(405,{error:'Method not allowed'},{Allow:'GET'});
        if(!await checkAdmin(req,c))throw httpError(403,'管理者キーが必要です。','ADMIN_REQUIRED');
        return json(200,await usage(env,c,now()));
      }
      if(path!=='/api/tts')return error(404,'Not found');
      if(req.method!=='POST')return json(405,{error:'Method not allowed'},{Allow:'POST'});
      if(req.headers.get('Sec-Fetch-Site')==='cross-site'||(req.headers.has('Origin')&&req.headers.get('Origin')!==url.origin))return error(403,'別サイトからの音声生成は許可されていません。');
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('Content-Type')||''))return error(415,'JSON形式で送信してください。');
      const data=await readJson(req),text=typeof data?.text==='string'?data.text.trim():'';
      if(!text)throw httpError(400,'英文を入力してください。');
      if([...text].length>c.maxRequestChars)throw httpError(413,`音声生成は1回につき${c.maxRequestChars.toLocaleString('ja-JP')}文字以内にしてください。英文の解析は引き続き利用できます。`,'REQUEST_CHAR_LIMIT');
      const admin=await checkAdmin(req,c),chunks=splitText(text);
      const reservation=await reserve(req,env,c,chunks,admin,now());
      // タイムアウト・応答消失・部分合成でも課金の可能性があるため、予約量は戻さない。
      const auth=await authorize(env);
      const type=chunks.length===1?'MP3':'LINEAR16',results=[];
      for(const chunk of chunks){beforeDispatch(reservation,now());results.push(await synthesize(chunk,type,c.voice,auth));}
      const audio=type==='MP3'?results[0]:joinWav(results);
      return new Response(audio,{headers:{...headers,'Content-Type':type==='MP3'?'audio/mpeg':'audio/wav'}});
    }catch(e){
      if(e.status)return error(e.status,e.message,e.code,e.retryAfter);
      // 入力英文・完全なURL・ヘッダー・OAuthエラーの詳細・認証情報はログに出力しない。
      if(e.googleStatus)return error(502,e.googleStatus===401||e.googleStatus===403?'Google Cloud の認証・API設定・請求先を確認してください。':e.googleStatus===429?'Google Cloud の利用上限に達しました。':'音声を生成できませんでした。','GOOGLE_TTS_ERROR');
      return error(503,'音声生成を利用できません。サーバー設定をご確認ください。','SERVER_UNAVAILABLE');
    }
  }};
}
export default createWorker();
