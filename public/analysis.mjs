'use strict';
import {applyConnectedSpeech} from './connected-speech.mjs';
let dictionaries=null;
const ON=new Set();
export function setDictionaries(value){dictionaries=value;ON.clear();ON.add('FL');value.onsets.forEach(x=>ON.add(x));}
const vowels=/[012]$/;const ipamap={AA:'ɑ',AE:'æ',AH:'ʌ',AO:'ɔ',AW:'aʊ',AY:'aɪ',EH:'ɛ',ER:'ɝ',EY:'eɪ',IH:'ɪ',IY:'i',OW:'oʊ',OY:'ɔɪ',UH:'ʊ',UW:'u',B:'b',CH:'tʃ',D:'d',DH:'ð',F:'f',G:'ɡ',HH:'h',JH:'dʒ',K:'k',L:'l',M:'m',N:'n',NG:'ŋ',P:'p',R:'ɹ',S:'s',SH:'ʃ',T:'t',TH:'θ',V:'v',W:'w',Y:'j',Z:'z',ZH:'ʒ'};
const set=s=>new Set(s.split(' ')), has=(s,w)=>s.has(w), own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const DET=set('a an the this that these those my your his her its our their some any every each either neither no both all such another enough what which whose');
const PRON=set('i me you he him she her it we us they them myself yourself himself herself itself ourselves yourselves themselves mine yours hers ours theirs someone somebody something anyone anybody anything everyone everybody everything nobody nothing none one ones');
const AUX=set("am is are was were be been being do does did have has had can could may might must shall should will would ought i'm you're he's she's it's we're they're i've you've we've they've i'll you'll he'll she'll it'll we'll they'll i'd you'd he'd she'd we'd they'd");
const PREP=set('of to in on at by for from with about as into onto over under through across among between against around before after since until during upon toward towards despite within without beyond per via off out than like near past above below behind beneath beside except regarding concerning');
const CONJ=set('and or but nor so yet if because although though while unless whether whereas once when where that since as');
const WH=set('who whom whose what which when where why how');
const NEG=set("not never no nobody nothing neither cannot can't couldn't won't wouldn't shouldn't didn't doesn't don't isn't aren't wasn't weren't haven't hasn't hadn't mustn't");
const PARTICLE=set('up out off down away back over in on through along around apart together');
const LIGHT=set('get got make made take took give gave go went come came put set keep kept let have had do did');
const AMB=set('need want like love hate know think feel mean look sound work play call use change start stop help try plan hope wish live move open close turn show watch read write drive run walk talk answer ask book record present permit object produce increase decrease import export conduct contrast address project refuse protest lead demand offer surprise visit travel study rain snow sleep dream drink eat dance sing ride');
const HETERO=set('record present permit object produce increase decrease import export conduct contrast project refuse protest contract contest convert conflict progress survey transfer transport rebel suspect insult impact update upgrade discount abstract extract compound');
const punctuationBoundary=/^[.!?;:,—–\n]+$/;
const knownWord=w=>dictionaries.has(w);
function ipa(p){if(p==='AH0')return 'ə';if(p==='ER0')return 'ɚ';return ipamap[p.replace(/[012]$/,'')]||p;}
function syllabify(pron){const p=pron.split(' '), vi=[];p.forEach((x,i)=>{if(vowels.test(x))vi.push(i)});if(!vi.length)return [{ipa:p.map(ipa).join(''),phones:p,stress:0}];let start=0,res=[];for(let j=0;j<vi.length;j++){const n=vi[j];let end=p.length;if(j+1<vi.length){end=vi[j+1];for(let t=n+1;t<=vi[j+1];t++){if(ON.has(p.slice(t,vi[j+1]).join(' '))){end=t;break;}}}res.push({ipa:p.slice(start,end).map(ipa).join(''),phones:p.slice(start,end),stress:Number(p[n].slice(-1))});start=end;}return res;}
function numberWords(n){const units='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' '), tens='zero ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');if(n<20)return [units[n]];if(n<100)return [tens[Math.floor(n/10)],...(n%10?[units[n%10]]:[])];if(n<1000)return [units[Math.floor(n/100)],'hundred',...(n%100?numberWords(n%100):[])];if(n<1000000)return [...numberWords(Math.floor(n/1000)),'thousand',...(n%1000?numberWords(n%1000):[])];return [...String(n)].map(x=>units[Number(x)]);}
function tokenize(text){let tokens=[];let re=/[A-Za-z]+(?:['’][A-Za-z]+)*|\d+(?:,\d{3})*(?:\.\d+)?|[.!?;:,—–]+|\n+|[^\s]/g;for(const m of text.matchAll(re)){let t=m[0],w=t.toLowerCase().replace(/’/g,"'");if(/^[a-z]/i.test(t)){tokens.push({word:t,w,type:'word'});}else if(/^\d/.test(t)){let clean=t.replace(/,/g,''),parts=clean.split('.'),a=parts[0].length<=6?numberWords(Number(parts[0])):[...parts[0]].flatMap(x=>numberWords(+x));if(parts.length>1)a.push('point',...[...parts[1]].flatMap(x=>numberWords(+x)));a.forEach((v,i)=>tokens.push({word:v,w:v,type:'word',numeric:t}));}else if(punctuationBoundary.test(t)){tokens.push({word:t,type:'punct',boundary:true});}else if(/^[\-"'()\[\]{}\/&]$/.test(t)){tokens.push({word:t,type:'punct',boundary:false});}else{tokens.push({word:t,type:'unsupported'});}}return tokens;}
function posInitial(t){let w=t.w;if(!w)return 'PUNCT';if(NEG.has(w))return 'NEG';if(WH.has(w))return 'WH';if(AUX.has(w))return 'AUX';if(PRON.has(w))return 'PRP';if(DET.has(w))return 'DT';if(CONJ.has(w))return 'CC';if(PREP.has(w))return 'IN';if(PARTICLE.has(w))return 'RP';let tag=dictionaries.tag(w);if(tag)return tag;if(/ly$/.test(w))return 'RB';if(/ing$/.test(w))return 'VBG';if(/ed$/.test(w))return 'VBD';if(/(ous|ful|less|able|ible|ive|al|ic)$/.test(w))return 'JJ';if(/s$/.test(w))return 'NNS';return 'NN';}
function tagWords(ts){const ws=ts.filter(t=>t.type==='word');ws.forEach(t=>t.tag=posInitial(t));for(let i=0;i<ws.length;i++){let t=ws[i],p=ws[i-1],n=ws[i+1],w=t.w;if(w==='that')t.tag=n&&/^(NN|JJ)/.test(n.tag)?'DT':'CC';if(w==='there')t.tag=n&&AUX.has(n.w)?'PRP':'RB';if(w==='like'&&p&&/^(PRP|AUX|NN)/.test(p.tag))t.tag='VB';if(w==='to')t.tag='IN';if(AMB.has(w)&&p&&(p.tag==='PRP'||p.tag==='AUX'||p.w==='to'||p.tag==='NEG'))t.tag='VB';if(AMB.has(w)&&p&&p.tag==='DT')t.tag='NN';if(p&&p.tag==='AUX'&&/^NN/.test(t.tag)&&AMB.has(w))t.tag='VB';if(w==='have'||w==='has'||w==='had'||w==='do'||w==='does'||w==='did'){if(!n||/^(DT|PRP|NN|JJ|CD)$/.test(n.tag)||/^NN/.test(n.tag))t.tag='VB';if(n&&n.tag==='NEG'&&ws[i+2]&&/^VB/.test(ws[i+2].tag))t.tag='AUX';if(/^(do|does|did)$/.test(w)&&n&&n.tag==='PRP'&&(!ws[i+2]||/^VB/.test(ws[i+2].tag)||AMB.has(ws[i+2].w)||LIGHT.has(ws[i+2].w)))t.tag='AUX';}if(PARTICLE.has(w)&&p&&/^VB/.test(p.tag))t.tag='RP';if(w==='as'&&n&&n.tag==='JJ')t.tag='IN';}return ws;}
function selectPron(w,tag,prev,next,forms){if(forms.length===1)return forms[0];if(w==='read'){const past=prev&&/^(have|has|had|already|yesterday)$/.test(prev.w);return forms.find(v=>v.includes(past?'EH1':'IY1'))||forms[0];}if(HETERO.has(w)){const verb=/^VB/.test(tag);const found=forms.find(v=>{const a=v.split(' ').filter(p=>vowels.test(p)).map(p=>p.slice(-1));return a.length>=2&&(verb?a[1]==='1':a[0]==='1');});if(found)return found;}if(w==='use')return forms.find(v=>v.endsWith(/^VB/.test(tag)?'Z':'S'))||forms[0];if(w==='the'&&next&&/^[aeiou]/.test(next.w))return forms.find(v=>v.includes('IY'))||forms[0];return forms[0];}
function fallback(w){let cleaned=w.replace(/[^a-z]/g,'');if(!cleaned)return [{ipa:w,stress:1,approx:true}];let g=[...cleaned.matchAll(/[aeiouy]+/g)];if(g.length>1&&/[^aeiouy]e$/.test(cleaned)&&!(/[^aeiouy]le$/.test(cleaned)))g.pop();if(!g.length)return [{ipa:cleaned,stress:1,approx:true}];let s=0;return g.map((v,i)=>{let e=i===g.length-1?cleaned.length:g[i+1].index-1;e=Math.max(e,v.index+v[0].length);let seg=cleaned.slice(s,e);s=e;return {ipa:seg||v[0],stress:i===Math.max(0,g.length-2)?1:0,approx:true};});}
function pronounce(t,prev,next){let forms=knownWord(t.w)?dictionaries.pronunciations(t.w):null;if(!forms&&t.w.endsWith("'s")&&knownWord(t.w.slice(0,-2))){let stem=dictionaries.pronunciations(t.w.slice(0,-2))[0];let last=stem.split(' ').at(-1);let tail=/^(S|Z|SH|ZH|CH|JH)$/.test(last)?' IH0 Z':/^(P|T|K|F|TH)$/.test(last)?' S':' Z';forms=[stem+tail];}if(!forms&&t.w.endsWith("s'")&&knownWord(t.w.slice(0,-1)))forms=dictionaries.pronunciations(t.w.slice(0,-1));t.unknown=!forms;t.variants=forms?forms.length:0;t.pron=forms?selectPron(t.w,t.tag,prev,next,forms):null;t.syls=t.pron?syllabify(t.pron):fallback(t.w);t.syls.forEach((s,i)=>{s.word=t;s.idx=i;s.auto=false;s.beat=false;});}
function score(t){let w=t.w,tag=t.tag;if(tag==='NEG')return 3.5;if(tag==='WH')return 2.65;if(tag==='RP')return 2.4;if(/^NN/.test(tag)||tag==='CD')return 3.2;if(/^VB/.test(tag))return LIGHT.has(w)?2.45:3.05;if(/^JJ/.test(tag))return 2.65;if(/^RB/.test(tag))return /^(very|really|quite|just|only|too|also|even|still)$/.test(w)?2.05:2.75;if(tag==='UH')return 2.35;if(tag==='DT'||tag==='PRP'||tag==='AUX'||tag==='IN'||tag==='CC')return -1.5;return 1.9;}
const config={sparse:{base:2.20,clash:2.20,near:.48,secondary:false},normal:{base:1.45,clash:1.35,near:.13,secondary:false},dense:{base:.65,clash:.48,near:0,secondary:true}};
function candidates(phrase,density){const c=config[density],ss=phrase.syls;let candidates=[];for(let t of phrase.words){let sc=score(t);let strong=t.syls.map((s,i)=>[s,i]).filter(([s])=>s.stress===1).map(([s,i])=>i);if(!strong.length){let secondary=t.syls.findIndex(s=>s.stress===2);strong=[secondary<0?0:secondary];} // CMU辞書に主強勢が二つあっても、原則として一語に一つの拍の核を置く。
let main=strong.at(-1);if(strong.length>1&&c.secondary){for(const i of strong.slice(0,-1))candidates.push({s:t.syls[i],weight:sc-1.5});}if(sc>0)candidates.push({s:t.syls[main],weight:sc});if(c.secondary&&sc>=2.5){for(let s of t.syls)if(s.stress===2&&s!==t.syls[main])candidates.push({s,weight:sc-1.55});}}
let content=phrase.words.filter(t=>score(t)>0);if(!content.length&&!phrase.tokens.some(t=>t.type==='punct'&&/[.!?]/.test(t.word)))return new Set();let nuclear=content.at(-1)||phrase.words.at(-1);if(!nuclear)return [];let target=candidates.filter(x=>x.s.word===nuclear).sort((a,b)=>b.weight-a.weight)[0];if(!target){target={s:nuclear.syls.find(s=>s.stress===1)||nuclear.syls.at(-1),weight:0};candidates.push(target);}target.mandatory=true;let indexes=new Map(ss.map((s,i)=>[s,i]));candidates.sort((a,b)=>indexes.get(a.s)-indexes.get(b.s));let dp=[],back=[];for(let i=0;i<candidates.length;i++){let x=candidates[i],val=x.weight-c.base+(x.mandatory?1000:0),best=0,prev=-1;for(let j=0;j<i;j++){let gap=indexes.get(x.s)-indexes.get(candidates[j].s);if(gap===0)continue;let penalty=gap===1?c.clash:gap===2?c.near:0;if(dp[j]-penalty>best){best=dp[j]-penalty;prev=j;}}dp[i]=val+best;back[i]=prev;}let best=dp.indexOf(Math.max(...dp));let chosen=new Set;for(let i=best;i>=0;i=back[i])chosen.add(candidates[i].s);return chosen;}
let serial=0;
export function makeModel(text,density='normal'){let ts=tokenize(text), phrases=[], current=[];function finish(){if(current.some(t=>t.type==='word'))phrases.push({tokens:current,words:[],syls:[]});current=[];}for(let t of ts){current.push(t);if(t.boundary)finish();}finish();let all=[];for(let p of phrases){p.words=tagWords(p.tokens);predicateRoles(p);p.words.forEach((t,i)=>{pronounce(t,p.words[i-1],p.words[i+1]);for(let s of t.syls){s.id=serial++;p.syls.push(s);all.push(s);}});let chosen=candidates(p,density);p.syls.forEach(s=>s.auto=s.beat=chosen.has(s));}return {text,density,tokens:ts,phrases,all,words:ts.filter(t=>t.type==='word'),unsupported:ts.filter(t=>t.type==='unsupported').map(t=>t.word)};}


// カタカナは近似表記とし、f・v・th・dhだけを英字で残す。
ON.add('FL');
let rhythmStyle=true;
const SPECIAL={F:'f',V:'v',TH:'th',DH:'dh'};
const CODA={B:'ブ',CH:'チ',D:'ド',DH:'dh',F:'f',G:'グ',HH:'ハ',JH:'ジ',DY:'ヂ',K:'ク',L:'ル',M:'ム',N:'ン',NG:'ン',P:'プ',R:'',S:'ス',SH:'シュ',T:'ト',TH:'th',V:'v',W:'ウ',Y:'イ',Z:'ズ',ZH:'ジュ'};
const VOW={AA:['a','ア',''],AE:['a','ア','ェ'],AH:['a','ア',''],AO:['o','オ','ー'],AW:['a','ア','ウ'],AY:['a','ア','イ'],EH:['e','エ',''],ER:['a','ア','ー'],EY:['e','エ','イ'],IH:['i','イ',''],IY:['i','イ','ー'],OW:['o','オ','ウ'],OY:['o','オ','イ'],UH:['u','ウ',''],UW:['u','ウ','ー']};
const KANA_ON={B:['バ','ビ','ブ','ベ','ボ'],CH:['チャ','チ','チュ','チェ','チョ'],D:['ダ','ディ','ドゥ','デ','ド'],G:['ガ','ギ','グ','ゲ','ゴ'],HH:['ハ','ヒ','フ','ヘ','ホ'],JH:['ジャ','ジ','ジュ','ジェ','ジョ'],DY:['ヂャ','ヂ','ヂュ','ヂェ','ヂョ'],K:['カ','キ','ク','ケ','コ'],L:['ラ','リ','ル','レ','ロ'],M:['マ','ミ','ム','メ','モ'],N:['ナ','ニ','ヌ','ネ','ノ'],P:['パ','ピ','プ','ペ','ポ'],R:['ラ','リ','ル','レ','ロ'],S:['サ','スィ','ス','セ','ソ'],SH:['シャ','シ','シュ','シェ','ショ'],T:['タ','ティ','トゥ','テ','ト'],W:['ワ','ウィ','ウ','ウェ','ウォ'],Y:['ヤ','イ','ユ','イェ','ヨ'],Z:['ザ','ズィ','ズ','ゼ','ゾ'],ZH:['ジャ','ジ','ジュ','ジェ','ジョ']};
const palatal={K:'キ',G:'ギ',S:'シ',Z:'ジ',T:'ティ',D:'ディ',N:'ニ',HH:'ヒ',B:'ビ',P:'ピ',M:'ミ',L:'リ',R:'リ',CH:'チ',SH:'シ',JH:'ジ',ZH:'ジ'};
function kanaPhones(phones,weak=false){
 if(!phones?.length)return '';
 let vi=phones.findIndex(x=>vowels.test(x));
 const coda=p=>rhythmStyle&&p==='L'?'ウ':p==='STOP'?'ッ':CODA[p]??'';
 if(vi<0)return phones.map(coda).join('');
 let v=phones[vi],base=v.slice(0,-1),str=v.at(-1),[col,solo,tail]=VOW[base]||VOW.AH;
 if(base==='AH'&&str==='0'){solo=weak?'ァ':'ア';tail='';}
 if(base==='ER'&&str==='0'){solo=weak?'ァ':'ア';tail='';}
 if(weak&&(base==='IY'||base==='UW'))tail='';
 let on=phones.slice(0,vi),post=phones.slice(vi+1),prefix='',sound=solo;
 if(rhythmStyle){
  // 母音の近似表記は英語の綴りではなくARPAbetの音素に基づく。
  if(base==='AE'){col='e';solo='エ';tail='ァ';}
  if(base==='IH'&&str!=='0'&&!weak&&['NG','L'].includes(post[0])){col='e';solo='エ';tail='';}
  if(base==='ER'&&str!=='0'){col='u';solo='ウ';tail='ォァ';}
  if(base==='ER'&&str==='0'&&post.length===0&&!weak){col='o';solo='オ';tail='';}
  if(base==='AH'&&str==='0'&&post[0]==='S'){col='e';solo='エ';tail='';}
  if(base==='AH'&&str==='0'&&post[0]==='N'&&['SH','ZH','CH','JH'].includes(on.at(-1))){col='u';solo='ウ';tail='';}
  // 語末の暗いLは、余分なラ行音や音節を加えないように表記する。
  if(post[0]==='L'&&base==='AH'&&str==='0'){col='u';solo='ウ';tail=SPECIAL[on.at(-1)]?'':'ゥ';post.shift();}
 }
 let idx='aiueo'.indexOf(col);sound=solo;
 // 母音の後のRは英字を残さず、母音の音質や長さで表す。
 if(post[0]==='R'){
   post.shift();
   if(base==='AA'||base==='AH')tail='ー';
   else if(base==='EH'||base==='IH'||base==='UH')tail='ア';
 }
 if(on.length){let last=on.pop();
  if(last==='Y'&&on.length&&SPECIAL[on.at(-1)])sound=SPECIAL[on.pop()]+(['ャ','ィ','ュ','ェ','ョ'][idx]);
  else if(last==='Y'&&on.length&&palatal[on.at(-1)])sound=palatal[on.pop()]+(['ャ','','ュ','ェ','ョ'][idx]||'');
  else if(SPECIAL[last])sound=SPECIAL[last]+({'ア':'ァ','イ':'ィ','ウ':'ゥ','エ':'ェ','オ':'ォ'}[solo]||solo);
  else if(last==='FL')sound=['ラ','リ','ル','レ','ロ'][idx];
  else if(rhythmStyle&&last==='W'&&idx===0&&base!=='AA')sound='ウァ';
  else sound=KANA_ON[last]?.[idx]||solo;
  prefix=on.map(x=>x==='R'?'ル':coda(x)).join('');
 }
 return prefix+sound+tail+post.map(coda).join('');
}
function approxKana(spelling){
 // 辞書未登録語の綴りからの推定は近似にすぎないため、IPAとして表示しない。
 let w=spelling.toLowerCase().replace(/[^a-z]/g,'');if(!w)return spelling;
 const letters={a:'AH1',e:'EH1',i:'IH1',o:'AO1',u:'UH1',y:'IH1',b:'B',c:'K',d:'D',f:'F',g:'G',h:'HH',j:'JH',k:'K',l:'L',m:'M',n:'N',p:'P',q:'K',r:'R',s:'S',t:'T',v:'V',w:'W',x:'K S',z:'Z'};
 // よくある複数文字の綴りを優先して音素を推定し、未知語の表示だけに用いる。
 const dig={ch:'CH',sh:'SH',th:'TH',ph:'F',ng:'NG',qu:'K W',ee:'IY1',ea:'IY1',oo:'UW1',ai:'EY1',ay:'EY1',oa:'OW1',ow:'OW1',ou:'AW1',oi:'OY1',oy:'OY1',igh:'AY1'};
 let ps=[];for(let i=0;i<w.length;){let t=w.slice(i,i+3),d=w.slice(i,i+2);if(dig[t]){ps.push(...dig[t].split(' '));i+=3;}else if(dig[d]){ps.push(...dig[d].split(' '));i+=2;}else{ps.push(...(letters[w[i]]||'').split(' ').filter(Boolean));i++;}}
 return ps.length?syllabify(ps.join(' ')).map(x=>kanaPhones(x.phones)).join(''):spelling;
}
// 辞書形の弱形を定義し、その後で読みやすさを優先した近似表記を適用する。
const WEAK_PHONES={a:'AH0',an:'AH0 N',and:'N',or:'ER0',but:'B AH0 T',of:'AH0 V',for:'F ER0',from:'F R AH0 M',at:'AH0 T',as:'AH0 Z',than:'DH AH0 N',that:'DH AH0 T',some:'S AH0 M',your:'Y UH0 R',"you're":'Y UH0 R',our:'AW0 ER0',their:'DH EH0 R',them:'DH AH0 M',us:'AH0 S',you:'Y UW0',me:'M IY0',we:'W IY0',she:'SH IY0',he:'HH IY0',him:'HH IH0 M',her:'HH ER0',his:'HH IH0 Z',it:'IH0 T',is:'IH0 Z',are:'ER0',was:'W AH0 Z',were:'W ER0',am:'AH0 M',be:'B IY0',been:'B IH0 N',can:'K AH0 N',could:'K UH0 D',would:'W UH0 D',should:'SH UH0 D',will:'W IH0 L',do:'D UW0',does:'D AH0 Z',did:'D IH0 D',have:'HH AH0 V',has:'HH AH0 Z',had:'HH AH0 D',there:'DH EH0 R',if:'IH0 F'};
const VSTART=t=>!!t?.syls[0]?.phones?.[0]&&vowels.test(t.syls[0].phones[0]);
const unstressed=t=>t&&!t.syls.some(s=>s.beat);
const isFunction=t=>/^(DT|PRP\$?|AUX|IN|CC|MD)$/.test(t.tag);
function setReading(s,value,note=''){s.reading=value;s.note=note;s.readingChanged=!!note;}
function renderPhones(ps,weak=false){return syllabify(ps.join(' ')).map(s=>kanaPhones(s.phones,weak)).join('');}
// 弱形→音素の連結・融合→カタカナの順に処理する。元の辞書音素は変更しない。
const SHORT_WEAK={about:['','バゥ'],and:['ン'],could:['ク'],would:['ウ'],should:['シュ'],to:['トゥ']};
const READABLE_WORDS={serious:['シ','リ','アス'],spain:['スパイン']};
const weakSyllable=s=>!s.beat&&(s.stress===0||unstressed(s.word));
export function readings(p,natural=true){
 rhythmStyle=natural;
 for(const s of p.syls){
  s.readPhones=s.phones?.slice()||null;s.note='';s.connectedChanged=false;s.omitWeakVowel=false;
  setReading(s,s.phones?kanaPhones(s.phones,false):approxKana(s.ipa));
 }
 if(!natural)return;
 for(let i=0;i<p.words.length;i++){
  const t=p.words[i],next=p.words[i+1];
  if(t.unknown||t.syls.length!==1||!isFunction(t))continue;
  const s=t.syls[0];
  if(!unstressed(t)){
   const strong=dictionaries.pronunciations(t.w)?.find(pr=>pr.split(' ').some(x=>/1$/.test(x)));
   if(s.stress===0&&strong){s.readPhones=strong.split(' ');s.note='強形';}
   continue;
  }
  let ph=WEAK_PHONES[t.w];
  if(t.w==='the')ph=VSTART(next)?'DH IY0':'DH AH0';
  if(t.w==='to')ph=VSTART(next)?'T UW0':'T AH0';
  if(ph!==undefined){s.readPhones=ph.split(' ');s.note='弱形';}
 }
 // 読みやすさのため弱い母音を表示しない音節には、前の語の子音を移さない。
 for(const t of p.words){
  const hint=unstressed(t)&&SHORT_WEAK[t.w];
  if(hint&&hint.length===t.syls.length)t.syls.forEach((s,i)=>{s.omitWeakVowel=hint[i]==='';});
 }
 applyConnectedSpeech(p);
 for(const t of p.words){
  // 語ごとの短い学習用表記は、連結・融合によって音が変化していない場合に限る。
  const hint=unstressed(t)&&Object.hasOwn(SHORT_WEAK,t.w)?SHORT_WEAK[t.w]:Object.hasOwn(READABLE_WORDS,t.w)?READABLE_WORDS[t.w]:null;
  const useHint=hint&&hint.length===t.syls.length&&!t.syls.some(s=>s.connectedChanged);
  for(const s of t.syls){
   if(!s.readPhones)continue;
   if(useHint){setReading(s,hint[s.idx],unstressed(t)?'弱い語句の近似表記':'読みやすい近似表記');continue;}
   let ps=s.readPhones, note=s.note;
   // Rを英字で付加せず、語末の弱いR音性母音を短く近似する。
   if(s.idx===t.syls.length-1&&ps.at(-1)==='ER0'&&!isFunction(t)){
    ps=ps.slice(0,-1).concat('AO0');
    setReading(s,renderPhones(ps,true).replace(/ー$/,''),[note,'語末の弱い母音'].filter(Boolean).join('・'));
   }else{
    setReading(s,ps.length?renderPhones(ps,weakSyllable(s)):'',note);
   }
  }
 }
}

// 弱い単語のまとまりと強勢のある各単語を分ける。
 // 通常表示では読みやすい単語単位、詳細表示では音節単位で扱う。
export function readingUnits(p){
 const result=[];
 let weak=null;
 for(const t of p.words){
  const anchors=t.syls.filter(s=>s.beat);
  if(anchors.length){
   weak=null;
   // 拍を多くする設定では、綴りを重複させずに語内の複数の拍を保持する。
   let start=0;
   for(let i=0;i<anchors.length;i++){
    const end=i+1<anchors.length?anchors[i+1].idx:t.syls.length;
    result.push({strong:true,words:[t],syls:t.syls.slice(start,end),source:i===0?t.word:'',anchors:1});
    start=end;
   }
  }else{
   if(!weak){weak={strong:false,words:[],syls:[],source:'',anchors:0};result.push(weak);}
   weak.words.push(t);weak.syls.push(...t.syls);weak.source+=(weak.source?' ':'')+t.word;
  }
 }
 const punctuation=p.tokens.at(-1);
 if(result.length&&punctuation?.type==='punct'&&punctuation.boundary&&!punctuation.word.includes('\n'))result.at(-1).source+=punctuation.word;
 return result;
}
export function unitText(g){return g.syls.map(s=>s.reading).join('');}




// 述語の着色処理は、発音とリズムの推定モデルから分離する。
const BE_FULL=set("am is are was were be been being isn't aren't wasn't weren't");
const BE_SHORT=set("i'm you're he's she's it's we're they're that's there's who's what's where's how's");
const BE_AMBIG=set("he's she's it's that's there's who's what's where's how's");
const MODAL=set("can could may might must shall should will would ought can't couldn't won't wouldn't shouldn't mustn't cannot mightn't");
const HAVE_DO=set("have has had having do does did done doing haven't hasn't hadn't don't doesn't didn't");
const ADJ_PART=set('tired excited interested bored worried confused surprised pleased satisfied disappointed scared frightened annoyed exhausted amazed embarrassed relaxed concerned prepared ready depressed stressed upset delighted thrilled accustomed involved convinced ashamed asleep alone awake alive afraid aware glad sorry right wrong well finished done gone married used closed broken lost hurt');
const DEGREE=set('very really quite rather too so extremely fairly pretty almost particularly especially incredibly unusually absolutely completely deeply slightly more most less least enough just still');
const EXTRA_VERBS=set('smile laugh cry jump cook shop clean build watch sing help hope enjoy arrive finish study learn teach wait listen speak travel work rain snow swim dance sleep drink eat read walk run play drive stop start rest open close visit live move paint draw wash fix repair change remember forget know understand believe agree decide imagine happen meet follow stay stand sit carry bring send fall rise break cut choose spend pay save win lose');
const verbBase=w=>!!w&&(/^VB/.test(dictionaries.tag(w)||'')||AMB.has(w)||LIGHT.has(w)||EXTRA_VERBS.has(w));
const inflected=(w,end)=>{const stem=w.slice(0,-end.length);return [stem,stem+'e',stem.replace(/(.)\1$/,'$1'),stem.replace(/i$/,'y')].some(verbBase);};
const SUBJECT=t=>!!t&&(/^PRP$/.test(t.tag)||/^NN/.test(t.tag)||t.w==='there');
const noun=t=>!!t&&(/^NN/.test(t.tag)||t.tag==='CD');
const modifier=t=>!!t&&((/^RB/.test(t.tag)&&!ADJ_PART.has(t.w))||t.tag==='NEG'||DEGREE.has(t.w));
const adjLike=t=>!!t&&(/^JJ/.test(t.tag)||ADJ_PART.has(t.w));
function predicateRoles(p){
 const ws=p.words, tags=ws.map(t=>t.tag), be=new Set();
 const nextContent=i=>{while(i<ws.length&&modifier(ws[i]))i++;return i;};
 const hasSubjectBefore=i=>i>0&&SUBJECT(ws[i-1]);
 const isVerb=i=>i>=0&&i<ws.length&&(/^VB/.test(tags[i])||AMB.has(ws[i].w)||LIGHT.has(ws[i].w));
 // よくある動詞・名詞の曖昧性を前後の構文から解消し、表示だけに利用する。
 for(let i=0;i<ws.length;i++){
  const t=ws[i], prev=ws[i-1], next=ws[i+1], before=ws[i-2];
  if(!/^VB/.test(tags[i])&&verbBase(t.w)&&prev&&(MODAL.has(prev.w)||prev.w==='to'||prev.tag==='PRP'||(modifier(prev)&&before?.tag==='PRP')))tags[i]='VB';
  if(!/^VB/.test(tags[i])&&/ing$/.test(t.w)&&inflected(t.w,'ing')&&!adjLike(t)){let j=i-1;while(modifier(ws[j]))j--;if(ws[j]&&(BE_FULL.has(ws[j].w)||BE_SHORT.has(ws[j].w)))tags[i]='VBG';}
  if(!/^VB/.test(tags[i])&&/^NN/.test(tags[i])&&/s$/.test(t.w)&&prev&&(/^(NN|NNP|PRP)$/.test(prev.tag))&&(inflected(t.w,'s')||/es$/.test(t.w)&&inflected(t.w,'es')))tags[i]='VBZ';
  if(/^VB/.test(tags[i])&&prev&&(prev.tag==='DT'||prev.tag==='PRP$')&&!HAVE_DO.has(t.w))tags[i]='NN';
  if(/^VB/.test(tags[i])&&prev?.tag==='JJ'&&before?.tag==='DT'&&!HAVE_DO.has(t.w))tags[i]='NN';
 }
 for(let i=0;i<ws.length;i++){
  const t=ws[i], w=t.w; t.predicateRole='';
  if(BE_FULL.has(w)||BE_SHORT.has(w)){
   const j=nextContent(i+1);
   // 'sと過去分詞の組み合わせでは、BEではなくHAVEの場合もある（例：she's gone home）。
   if(BE_AMBIG.has(w)&&/^VBN$/.test(tags[j]||'')&&!adjLike(ws[j]))continue;
   be.add(i);
  }
 }
 // 助動詞とBE自体を除いた一般動詞を対象とする。
 for(let i=0;i<ws.length;i++){
  const t=ws[i], w=t.w;
  if(be.has(i)||MODAL.has(w))continue;
  if(HAVE_DO.has(w)){
   let j=nextContent(i+1);
   if(SUBJECT(ws[j])&&(!hasSubjectBefore(i)||i===0)&&/^((do|does|did)|(have|has|had))(n't)?$/.test(w))j=nextContent(j+1);
   const aux= /^(have|has|had|having|haven't|hasn't|hadn't)$/.test(w)?/^(VBN|VBD)$/.test(tags[j]||''):isVerb(j);
   if(aux||BE_FULL.has(ws[j]?.w)||t.tag==='AUX')continue;
   if(/^VB/.test(tags[i])||['have','has','had','having','do','does','did','done','doing'].includes(w))t.predicateRole='verb';
   continue;
  }
  if(/^VB/.test(tags[i])&&t.tag!=='AUX')t.predicateRole='verb';
 }
 // 連結動詞BEでは述語形容詞を着色し、助動詞・副詞・後続名詞を修飾する形容詞は着色しない。
 for(const i of be){
  let j=nextContent(i+1);
  // 疑問文の倒置を処理する（例：Are you happy? Is the room clean?）。
  if(!hasSubjectBefore(i)&&(i===0||ws[i-1]?.tag==='WH'||ws[i-1]?.tag==='CC'||modifier(ws[i-1]))){
   if(ws[j]?.tag==='PRP')j=nextContent(j+1);
   else if(ws[j]?.tag==='DT'||ws[j]?.tag==='PRP$'){
    let k=j+1;while(k<ws.length&&(adjLike(ws[k])||modifier(ws[k]))&&!noun(ws[k]))k++;
    if(noun(ws[k])){while(noun(ws[k+1]))k++;j=nextContent(k+1);}
   }else if(noun(ws[j])&&!adjLike(ws[j])){while(noun(ws[j+1]))j++;j=nextContent(j+1);}
  }
  if(!adjLike(ws[j]))continue;
  // 名詞を直接修飾する形容詞は述語形容詞ではない。
  let k=j;while(adjLike(ws[k])||modifier(ws[k]))k++;
  if(noun(ws[k])&&!(ADJ_PART.has(ws[j].w)&&/^(VBN|VBD)$/.test(tags[j])))continue;
  for(let n=j;n<k;n++)if(adjLike(ws[n])&&!DEGREE.has(ws[n].w))ws[n].predicateRole='adjective';
  // 等位接続された補語を処理する（例：is kind and generous / is happy but tired）。
  while(['and','or','but'].includes(ws[k]?.w)){
   let n=nextContent(k+1);if(!adjLike(ws[n]))break;
   let e=n;while(adjLike(ws[e])||modifier(ws[e]))e++;
   if(noun(ws[e]))break;
   for(;n<e;n++)if(adjLike(ws[n])&&!DEGREE.has(ws[n].w))ws[n].predicateRole='adjective';
   k=e;
  }
 }
}
