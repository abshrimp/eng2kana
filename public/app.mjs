'use strict';
import {loadDictionaries} from './dictionary.mjs';
import {setDictionaries,makeModel,readings,readingUnits,unitText} from './analysis.mjs';
const $=s=>document.querySelector(s);
let model=null,dictionaries=null,dictionaryState='loading';
function predicateSpan(t,value){const span=el('span',t?.predicateRole?'predicate-mark':'',value);if(t?.predicateRole)span.dataset.role=t.predicateRole;return span;}
function renderUnitOriginal(g){
 const e=el('div','unit-en');e.lang='en';
 if(!g.source){e.textContent='（続き）';return e;}
 const spelling=g.words.map(w=>w.word).join(' ');
 if(!g.source.startsWith(spelling)){e.textContent=g.source;return e;}
 g.words.forEach((t,i)=>{if(i)e.append(' ');e.append(predicateSpan(t,t.word));});
 e.append(g.source.slice(spelling.length));return e;
}
function renderUnitJapanese(g){
 const e=el('div','unit-ja'+(g.words.some(w=>w.unknown)?' unknown-reading':''));
 let last=null, text='';
 const flush=()=>{if(text)e.append(predicateSpan(last,text));text='';};
 for(const syl of g.syls){if(last!==syl.word){flush();last=syl.word;}text+=syl.reading||'';}
 flush();if(!e.textContent)e.textContent='—';return e;
}

function renderReadingSummary(out){
 const box=el('div','reading-summary');
 for(const p of model.phrases){
  const line=el('div','reading-line');
  for(const g of readingUnits(p)){
   const unit=el('div','rhythm-unit '+(g.strong?'strong':'weak'));
   const original=renderUnitOriginal(g);
    const ja=renderUnitJapanese(g);
   unit.setAttribute('aria-label',`${g.source||g.words[0].word}、${g.strong?'強拍':'弱い語句'}、${unitText(g)}`);
   unit.append(original,ja);line.append(unit);
  }
  box.append(line);
 }
 out.append(box);
}

const tagJP=t=>t==='NEG'?'否定':t==='WH'?'疑問詞':t==='AUX'?'助動詞':t==='DT'?'限定詞':t==='PRP'||t==='PRP$'?'代名詞':t==='IN'?'前置詞':t==='CC'?'接続詞':t==='RP'?'不変化詞':/^NN/.test(t)?'名詞':/^VB/.test(t)?'動詞':/^JJ/.test(t)?'形容詞':/^RB/.test(t)?'副詞':t==='CD'?'数詞':t==='MD'?'助動詞':'その他';
function el(tag,cls,text){let e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function toggle(s){s.beat=!s.beat;render(s.id);}
function syllableEl(s){let b=el('button','syllable'+(s.beat?' anchor':'')+(s.word.unknown?' unknown':''));b.type='button';b.dataset.syllable=String(s.id);b.setAttribute('aria-pressed',String(s.beat));b.setAttribute('aria-label',`${s.word.word} 第${s.idx+1}音節 ${s.reading||'脱落'}、${s.beat?'拍を解除':'拍に設定'}`);b.title=`${s.word.word} ${s.idx+1}/${s.word.syls.length} · 語彙強勢 ${s.stress}${s.note?' · '+s.note:''} · クリックで切替`;b.append(el('span','marker',s.beat?'●':s.stress===1?'○':s.stress===2?'◦':'·'));let mono=s.word.syls.length===1;b.append(el('span','sound'+(!s.reading?' reduced':''),s.reading||'脱落'));b.append(el('span','wordref',mono?s.word.word:`${s.word.word} ${s.idx+1}/${s.word.syls.length}`));b.append(el('span','ipa',s.word.unknown?'綴り推定':'/'+s.ipa+'/'));b.addEventListener('click',()=>toggle(s));return b;}
function metric(label,num){let d=el('div','metric');d.append(el('div','',label),el('strong','',String(num)));return d;}
function render(focusId){
 const out=$('#output'),edit=$('#edit'),wasOpen=!!edit.querySelector('details[open]');out.replaceChildren();edit.replaceChildren();
 if(!model||!model.words.length){out.append(el('p','empty','英文を入力してください。'));$('#copy').disabled=true;$('#reset').disabled=true;$('#beats-count').textContent='';return;}
 $('#copy').disabled=false;$('#reset').disabled=false;model.phrases.forEach(p=>readings(p,$('#connected').checked));
 $('#beats-count').textContent=model.all.filter(s=>s.beat).length+'拍';renderReadingSummary(out);
 const unknown=[...new Set(model.words.filter(t=>t.unknown).map(t=>t.word))];if(unknown.length||model.unsupported.length){const msg=[];if(unknown.length)msg.push('辞書未登録：'+unknown.join(', '));if(model.unsupported.length)msg.push('未対応の文字：'+[...new Set(model.unsupported)].join(' '));out.append(el('div','warning',msg.join('。')));}
 edit.append(el('p','','単語をタップすると強拍・弱拍を切り替えられます。'));
 const source=el('div','source');for(const t of model.tokens){if(t.type==='word'){const hit=t.syls.some(s=>s.beat),b=el('button','word'+(hit?' hit':''),t.word);b.type='button';b.lang='en';b.setAttribute('aria-pressed',String(hit));b.addEventListener('click',()=>{if(hit)t.syls.forEach(s=>s.beat=false);else (t.syls.filter(s=>s.stress===1).at(-1)||t.syls[0]).beat=true;render();});source.append(b);}else if(t.type==='punct'&&!t.word.includes('\n'))source.append(el('span','punct',t.word));}edit.append(source);
 const detail=el('details','detail');detail.open=wasOpen;detail.append(el('summary','','音節ごとの調整'));for(const p of model.phrases){const row=el('div','syllables');p.syls.forEach(s=>row.append(syllableEl(s)));detail.append(row);}edit.append(detail);edit.classList.toggle('hide-ipa',!$('#showipa').checked);if(focusId!==undefined)edit.querySelector(`[data-syllable="${focusId}"]`)?.focus({preventScroll:true});
}
function analyze(){if(!dictionaries)return;const txt=$('#input').value.trim(),mode=$('#density').value;model=makeModel(txt,mode);$('#toast').textContent='';render();}
function formatCopy(){return model.phrases.map(p=>readingUnits(p).map(g=>g.strong?unitText(g):'('+unitText(g)+')').join('｜')).join('\n');}
// 同一オリジンの音声生成APIを通じてGoogle Cloud TTSを呼び出す。認証情報はページに渡さない。
const speechButton = $('#speak');
const speechAudio = new Audio();
speechAudio.preload='none';
let speechSession=null, speechCache=null;
function syncSpeechButton(){
 const active=!!speechSession;
 speechButton.disabled=!$('#input').value.trim();
 $('#clear').disabled=!$('#input').value;
 speechButton.setAttribute('aria-pressed',String(active));
 $('#speak-label').textContent=active?(speechSession?.loading?'生成を中止':'停止'):'全文を再生';
 $('#speak-icon').setAttribute('d',active?'M6 6h12v12H6z':'M8 5v14l11-7z');
 speechButton.setAttribute('aria-busy',String(!!speechSession?.loading));
}
function stopSpeech(){
 const session=speechSession;speechSession=null;
 if(session){session.controller.abort();speechAudio.pause();try{speechAudio.currentTime=0;}catch{};if(session.loading)$('#toast').textContent='';}
 syncSpeechButton();
}
function clearSpeechCache(){
 speechAudio.removeAttribute('src');speechAudio.load();
 if(speechCache)URL.revokeObjectURL(speechCache.url);
 speechCache=null;
}
async function startSpeech(){
 if(speechSession){stopSpeech();return;}
 const text=$('#input').value.trim();if(!text)return;
 if(location.protocol==='file:'){$('#toast').textContent='音声再生には付属のサーバーを起動してアクセスしてください。';return;}
 const session={controller:new AbortController(),loading:false};speechSession=session;syncSpeechButton();$('#toast').textContent='';
 try{
  if(speechCache?.text!==text){
   clearSpeechCache();session.loading=true;syncSpeechButton();$('#toast').textContent='音声を生成しています…';
   const res=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json',...(ttsBypassKey!==null?{'X-TTS-Bypass':ttsBypassKey}:{})},body:JSON.stringify({text}),signal:session.controller.signal,cache:'no-store'});
   if(!res.ok){let data;try{data=await res.json();}catch{};throw new Error(data?.error||'音声を取得できませんでした。');}
   if(!/^audio\//i.test(res.headers.get('content-type')||''))throw new Error('音声の応答形式が正しくありません。');
   const blob=await res.blob();if(speechSession!==session)return;
   speechCache={text,url:URL.createObjectURL(blob)};
   speechAudio.src=speechCache.url;
  }
  if(speechSession!==session)return;
  session.loading=false;syncSpeechButton();$('#toast').textContent='';
  speechAudio.currentTime=0;
  await speechAudio.play();
  if(speechSession!==session){if(!speechSession)speechAudio.pause();return;}
 }catch(error){
  if(speechSession!==session)return;
  stopSpeech();
  $('#toast').textContent=error.name==='NotAllowedError'?'音声を取得しました。もう一度「全文を再生」を押してください。':error.name==='AbortError'?'':(error.message||'音声を再生できませんでした。');
 }
}
speechAudio.addEventListener('ended',()=>{if(speechSession&&!speechSession.loading){speechSession=null;syncSpeechButton();}});
speechAudio.addEventListener('error',()=>{if(speechSession&&!speechSession.loading){stopSpeech();clearSpeechCache();$('#toast').textContent='音声を再生できませんでした。';}});
speechButton.addEventListener('click',startSpeech);
$('#input').addEventListener('input',()=>{stopSpeech();clearSpeechCache();});
$('#clear').addEventListener('click',()=>{stopSpeech();clearSpeechCache();});
window.addEventListener('pagehide',()=>{stopSpeech();clearSpeechCache();});
syncSpeechButton();
let inputTimer;
function schedule(){clearTimeout(inputTimer);inputTimer=setTimeout(analyze,250);}
$('#input').addEventListener('input',e=>{if(!e.isComposing)schedule();});$('#input').addEventListener('compositionend',schedule);$('#input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();clearTimeout(inputTimer);analyze();}});
$('#analyze').addEventListener('click',()=>{clearTimeout(inputTimer);if(dictionaryState==='error'){initializeDictionaries();return;}analyze();$('#input').blur();});$('#clear').addEventListener('click',()=>{clearTimeout(inputTimer);$('#input').value='';syncSpeechButton();analyze();$('#input').focus();});$('#density').addEventListener('change',()=>{clearTimeout(inputTimer);analyze();});$('#connected').addEventListener('change',()=>{if(model)render();});$('#showipa').addEventListener('change',()=>{$('#edit').classList.toggle('hide-ipa',!$('#showipa').checked);if($('#showipa').checked)$('#edit details')?.setAttribute('open','');});$('#reset').addEventListener('click',()=>{if(model){model.all.forEach(s=>s.beat=s.auto);render();}});
$('#copy').addEventListener('click',async()=>{clearTimeout(inputTimer);if(!model||model.text!==$('#input').value.trim())analyze();if(!model?.words.length)return;try{await navigator.clipboard.writeText(formatCopy());$('#toast').textContent='コピーしました。';}catch{let a=el('textarea','sr-only');a.value=formatCopy();document.body.append(a);a.select();let ok=false;try{ok=document.execCommand('copy');}catch{}a.remove();$('#toast').textContent=ok?'コピーしました。':'コピーできませんでした。';}});

// 辞書の読み込み中は、未登録語として誤って解析しない。失敗時はボタンから再試行できる。
async function initializeDictionaries(){
 if(dictionaryState==='ready')return;
 dictionaryState='loading';
 const button=$('#analyze'), out=$('#output');
 button.hidden=true;button.disabled=true;button.textContent='辞書を再読み込み';
 out.setAttribute('aria-busy','true');
 out.replaceChildren(el('p','dictionary-status','辞書を読み込んでいます…'));
 try{
  const {pronunciation,pos}=document.documentElement.dataset;
  dictionaries=await loadDictionaries(pronunciation,pos);
  setDictionaries(dictionaries);
  dictionaryState='ready';button.hidden=true;button.disabled=true;
  analyze();
 }catch{
  dictionaries=null;dictionaryState='error';button.hidden=false;button.disabled=false;button.textContent='辞書を再読み込み';
  out.replaceChildren(el('p','dictionary-status error','辞書を読み込めませんでした。再読み込みしてください。'));
 }finally{out.setAttribute('aria-busy','false');}
}
initializeDictionaries();
