import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const source=process.argv[2];
if(!source){console.error('使い方: node scripts/create-secrets.mjs /path/to/google-tts.json');process.exit(1);}
const key=JSON.parse(readFileSync(source,'utf8'));
if(key.type!=='service_account'||!key.client_email||!key.private_key||!key.project_id)throw new Error('GoogleのサービスアカウントのJSON秘密鍵を指定してください。');
const secrets={GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(key),TTS_ADMIN_BYPASS_KEY:randomBytes(32).toString('hex'),TTS_IP_HASH_KEY:randomBytes(32).toString('hex')};
writeFileSync('secrets.production.json',JSON.stringify(secrets,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('secrets.production.json を作成しました。コミット・共有しないでください。');
console.log('GOOGLE_CLOUD_PROJECT = '+key.project_id);
console.log('管理者キーは secrets.production.json の TTS_ADMIN_BYPASS_KEY です。');
