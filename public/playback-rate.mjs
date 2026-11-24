// 音声の再生成は行わず、ブラウザで再生速度だけを変更する。
export const PLAYBACK_RATES=Object.freeze([0.5,0.65,0.75,0.85,1,1.15,1.25,1.5,1.75,2]);
const STORAGE_KEY='eng2kana.playbackRate';
export function normalizePlaybackRate(value){
 const n=Number(value);
 return PLAYBACK_RATES.includes(n)?n:1;
}
export function restorePlaybackRate(host){
 try{return normalizePlaybackRate(host.localStorage.getItem(STORAGE_KEY));}catch{return 1;}
}
export function storePlaybackRate(host,value){
 try{host.localStorage.setItem(STORAGE_KEY,String(normalizePlaybackRate(value)));}catch{/* ブラウザが保存を許可しない場合も再生は継続する。 */}
}
export function applyPlaybackRate(audio,value){
 const rate=normalizePlaybackRate(value);
 // 音声ファイルを切り替えた場合も選択速度を維持する。
 audio.defaultPlaybackRate=rate;
 audio.playbackRate=rate;
 if('preservesPitch' in audio)audio.preservesPitch=true;
 if('webkitPreservesPitch' in audio)audio.webkitPreservesPitch=true;
 return rate;
}
