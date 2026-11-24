'use strict';
import {loadDictionaries} from './dictionary.mjs';
const $=s=>document.querySelector(s);
let dictionaries=null, dictionaryState='loading';
const ON=new Set();
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
function tagWords(ts){const ws=ts.filter(t=>t.type==='word');ws.forEach(t=>t.tag=posInitial(t));for(let i=0;i<ws.length;i++){let t=ws[i],p=ws[i-1],n=ws[i+1],w=t.w;if(w==='that')t.tag=n&&/^(NN|JJ)/.test(n.tag)?'DT':'CC';if(w==='there')t.tag=n&&AUX.has(n.w)?'PRP':'RB';if(w==='like'&&p&&/^(PRP|AUX|NN)/.test(p.tag))t.tag='VB';if(w==='to')t.tag='IN';if(AMB.has(w)&&p&&(p.tag==='PRP'||p.tag==='AUX'||p.w==='to'||p.tag==='NEG'))t.tag='VB';if(AMB.has(w)&&p&&p.tag==='DT')t.tag='NN';if(p&&p.tag==='AUX'&&/^NN/.test(t.tag)&&AMB.has(w))t.tag='VB';if(w==='have'||w==='has'||w==='had'||w==='do'||w==='does'||w==='did'){if(!n||/^(DT|PRP|NN|JJ|CD)$/.test(n.tag)||/^NN/.test(n.tag))t.tag='VB';if(n&&n.tag==='NEG'&&ws[i+2]&&/^VB/.test(ws[i+2].tag))t.tag='AUX';if(/^(do|does|did)$/.test(w)&&n&&n.tag==='PRP'&&ws[i+2]&&(/^VB/.test(ws[i+2].tag)||AMB.has(ws[i+2].w)||LIGHT.has(ws[i+2].w)))t.tag='AUX';}if(PARTICLE.has(w)&&p&&/^VB/.test(p.tag))t.tag='RP';if(w==='as'&&n&&n.tag==='JJ')t.tag='IN';}return ws;}
function selectPron(w,tag,prev,next,forms){if(forms.length===1)return forms[0];if(w==='read'){const past=prev&&/^(have|has|had|already|yesterday)$/.test(prev.w);return forms.find(v=>v.includes(past?'EH1':'IY1'))||forms[0];}if(HETERO.has(w)){const verb=/^VB/.test(tag);const found=forms.find(v=>{const a=v.split(' ').filter(p=>vowels.test(p)).map(p=>p.slice(-1));return a.length>=2&&(verb?a[1]==='1':a[0]==='1');});if(found)return found;}if(w==='use')return forms.find(v=>v.endsWith(/^VB/.test(tag)?'Z':'S'))||forms[0];if(w==='the'&&next&&/^[aeiou]/.test(next.w))return forms.find(v=>v.includes('IY'))||forms[0];return forms[0];}
function fallback(w){let cleaned=w.replace(/[^a-z]/g,'');if(!cleaned)return [{ipa:w,stress:1,approx:true}];let g=[...cleaned.matchAll(/[aeiouy]+/g)];if(g.length>1&&/[^aeiouy]e$/.test(cleaned)&&!(/[^aeiouy]le$/.test(cleaned)))g.pop();if(!g.length)return [{ipa:cleaned,stress:1,approx:true}];let s=0;return g.map((v,i)=>{let e=i===g.length-1?cleaned.length:g[i+1].index-1;e=Math.max(e,v.index+v[0].length);let seg=cleaned.slice(s,e);s=e;return {ipa:seg||v[0],stress:i===Math.max(0,g.length-2)?1:0,approx:true};});}
function pronounce(t,prev,next){let forms=knownWord(t.w)?dictionaries.pronunciations(t.w):null;if(!forms&&t.w.endsWith("'s")&&knownWord(t.w.slice(0,-2))){let stem=dictionaries.pronunciations(t.w.slice(0,-2))[0];let last=stem.split(' ').at(-1);let tail=/^(S|Z|SH|ZH|CH|JH)$/.test(last)?' IH0 Z':/^(P|T|K|F|TH)$/.test(last)?' S':' Z';forms=[stem+tail];}if(!forms&&t.w.endsWith("s'")&&knownWord(t.w.slice(0,-1)))forms=dictionaries.pronunciations(t.w.slice(0,-1));t.unknown=!forms;t.variants=forms?forms.length:0;t.pron=forms?selectPron(t.w,t.tag,prev,next,forms):null;t.syls=t.pron?syllabify(t.pron):fallback(t.w);t.syls.forEach((s,i)=>{s.word=t;s.idx=i;s.auto=false;s.beat=false;});}
function score(t){let w=t.w,tag=t.tag;if(tag==='NEG')return 3.5;if(tag==='WH')return 2.65;if(tag==='RP')return 2.4;if(/^NN/.test(tag)||tag==='CD')return 3.2;if(/^VB/.test(tag))return LIGHT.has(w)?2.45:3.05;if(/^JJ/.test(tag))return 2.65;if(/^RB/.test(tag))return /^(very|really|quite|just|only|too|also|even|still)$/.test(w)?2.05:2.75;if(tag==='UH')return 2.35;if(tag==='DT'||tag==='PRP'||tag==='AUX'||tag==='IN'||tag==='CC')return -1.5;return 1.9;}
const config={sparse:{base:2.20,clash:2.20,near:.48,secondary:false},normal:{base:1.45,clash:1.35,near:.13,secondary:false},dense:{base:.65,clash:.48,near:0,secondary:true}};
function candidates(phrase,density){const c=config[density],ss=phrase.syls;let candidates=[];for(let t of phrase.words){let sc=score(t);let strong=t.syls.map((s,i)=>[s,i]).filter(([s])=>s.stress===1).map(([s,i])=>i);if(!strong.length){let secondary=t.syls.findIndex(s=>s.stress===2);strong=[secondary<0?0:secondary];} // CMU辞書に主強勢が二つあっても、原則として一語に一つの拍の核を置く。
let main=strong.at(-1);if(strong.length>1&&c.secondary){for(const i of strong.slice(0,-1))candidates.push({s:t.syls[i],weight:sc-1.5});}if(sc>0)candidates.push({s:t.syls[main],weight:sc});if(c.secondary&&sc>=2.5){for(let s of t.syls)if(s.stress===2&&s!==t.syls[main])candidates.push({s,weight:sc-1.55});}}
let content=phrase.words.filter(t=>score(t)>0);if(!content.length&&!phrase.tokens.some(t=>t.type==='punct'&&/[.!?]/.test(t.word)))return new Set();let nuclear=content.at(-1)||phrase.words.at(-1);if(!nuclear)return [];let target=candidates.filter(x=>x.s.word===nuclear).sort((a,b)=>b.weight-a.weight)[0];if(!target){target={s:nuclear.syls.find(s=>s.stress===1)||nuclear.syls.at(-1),weight:0};candidates.push(target);}target.mandatory=true;let indexes=new Map(ss.map((s,i)=>[s,i]));candidates.sort((a,b)=>indexes.get(a.s)-indexes.get(b.s));let dp=[],back=[];for(let i=0;i<candidates.length;i++){let x=candidates[i],val=x.weight-c.base+(x.mandatory?1000:0),best=0,prev=-1;for(let j=0;j<i;j++){let gap=indexes.get(x.s)-indexes.get(candidates[j].s);if(gap===0)continue;let penalty=gap===1?c.clash:gap===2?c.near:0;if(dp[j]-penalty>best){best=dp[j]-penalty;prev=j;}}dp[i]=val+best;back[i]=prev;}let best=dp.indexOf(Math.max(...dp));let chosen=new Set;for(let i=best;i>=0;i=back[i])chosen.add(candidates[i].s);return chosen;}
let model=null;let serial=0;
function makeModel(text,density){let ts=tokenize(text), phrases=[], current=[];function finish(){if(current.some(t=>t.type==='word'))phrases.push({tokens:current,words:[],syls:[]});current=[];}for(let t of ts){current.push(t);if(t.boundary)finish();}finish();let all=[];for(let p of phrases){p.words=tagWords(p.tokens);predicateRoles(p);p.words.forEach((t,i)=>{pronounce(t,p.words[i-1],p.words[i+1]);for(let s of t.syls){s.id=serial++;p.syls.push(s);all.push(s);}});let chosen=candidates(p,density);p.syls.forEach(s=>s.auto=s.beat=chosen.has(s));}return {text,density,tokens:ts,phrases,all,words:ts.filter(t=>t.type==='word'),unsupported:ts.filter(t=>t.type==='unsupported').map(t=>t.word)};}
function groups(p){let r=[],g=null;for(let s of p.syls){if(s.beat){g={pickup:false,syls:[]};r.push(g);}else if(!g){g={pickup:true,syls:[]};r.push(g);}g.syls.push(s);}return r;}

// カタカナは近似表記とし、f・v・th・dhだけを英字で残す。
ON.add('FL');
let rhythmStyle=true;
const SPECIAL={F:'f',V:'v',TH:'th',DH:'dh'};
const CODA={B:'ブ',CH:'チ',D:'ド',DH:'dh',F:'f',G:'グ',HH:'ハ',JH:'ジ',K:'ク',L:'ル',M:'ム',N:'ン',NG:'ン',P:'プ',R:'',S:'ス',SH:'シュ',T:'ト',TH:'th',V:'v',W:'ウ',Y:'イ',Z:'ズ',ZH:'ジュ'};
const VOW={AA:['a','ア',''],AE:['a','ア','ェ'],AH:['a','ア',''],AO:['o','オ','ー'],AW:['a','ア','ウ'],AY:['a','ア','イ'],EH:['e','エ',''],ER:['a','ア','ー'],EY:['e','エ','イ'],IH:['i','イ',''],IY:['i','イ','ー'],OW:['o','オ','ウ'],OY:['o','オ','イ'],UH:['u','ウ',''],UW:['u','ウ','ー']};
const KANA_ON={B:['バ','ビ','ブ','ベ','ボ'],CH:['チャ','チ','チュ','チェ','チョ'],D:['ダ','ディ','ドゥ','デ','ド'],G:['ガ','ギ','グ','ゲ','ゴ'],HH:['ハ','ヒ','フ','ヘ','ホ'],JH:['ジャ','ジ','ジュ','ジェ','ジョ'],K:['カ','キ','ク','ケ','コ'],L:['ラ','リ','ル','レ','ロ'],M:['マ','ミ','ム','メ','モ'],N:['ナ','ニ','ヌ','ネ','ノ'],P:['パ','ピ','プ','ペ','ポ'],R:['ラ','リ','ル','レ','ロ'],S:['サ','スィ','ス','セ','ソ'],SH:['シャ','シ','シュ','シェ','ショ'],T:['タ','ティ','トゥ','テ','ト'],W:['ワ','ウィ','ウ','ウェ','ウォ'],Y:['ヤ','イ','ユ','イェ','ヨ'],Z:['ザ','ズィ','ズ','ゼ','ゾ'],ZH:['ジャ','ジ','ジュ','ジェ','ジョ']};
const palatal={K:'キ',G:'ギ',S:'スィ',Z:'ズィ',T:'ティ',D:'ディ',N:'ニ',HH:'ヒ',B:'ビ',P:'ピ',M:'ミ',L:'リ',R:'リ',CH:'チ',SH:'シ',JH:'ジ',ZH:'ジ'};
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
function readings(p,natural){
 rhythmStyle=natural;
 for(const s of p.syls){s.readPhones=s.phones?.slice()||null;setReading(s,s.phones?kanaPhones(s.phones,false):approxKana(s.ipa));}
 if(!natural)return;
 for(let i=0;i<p.words.length;i++){
  const t=p.words[i],next=p.words[i+1];
  for(const s of t.syls){if(s.phones&&s.stress===0&&!s.beat)setReading(s,kanaPhones(s.phones,true));}
  if(t.unknown||t.syls.length!==1||!isFunction(t))continue;
  const s=t.syls[0];
  if(!unstressed(t)){
    const strong=dictionaries.pronunciations(t.w)?.find(pr=>pr.split(' ').some(x=>/1$/.test(x)));
    if(s.stress===0&&strong){s.readPhones=strong.split(' ');setReading(s,renderPhones(s.readPhones),'強形');}
    continue;
  }
  let ph=WEAK_PHONES[t.w];
  if(t.w==='the')ph=VSTART(next)?'DH IY0':'DH AH0';
  if(t.w==='to')ph=VSTART(next)?'T UW0':'T AH0';
  if(ph!==undefined){s.readPhones=ph.split(' ');setReading(s,renderPhones(s.readPhones,true),'弱形');}
 }
 // 単語を削除せず、if you'reの連結表記を維持する。
 for(let i=0;i<p.words.length-1;i++){
  const a=p.words[i],b=p.words[i+1];
  if(a.w==='if'&&b.w==="you're"&&a.syls.length===1&&b.syls.length===1&&unstressed(b)){
    setReading(a.syls[0],'イf','連結');setReading(b.syls[0],'ュア','連結');
  }
 }
 // 子音を後続の弱い母音へ移すだけで、音素自体の削除や置換は行わない。
 for(let i=0;i<p.words.length-1;i++){
  let a=p.words[i].syls.at(-1),b=p.words[i+1].syls[0];
  if(!a.readPhones||!b.readPhones||a.word.unknown||b.word.unknown||b.beat||a.note==='連結'||b.note==='連結'||!vowels.test(b.readPhones[0]||''))continue;
  const last=a.readPhones.at(-1);
  if(!Object.hasOwn(CODA,last)||['NG','HH','W','Y','R'].includes(last)||!a.readPhones.some(x=>vowels.test(x)))continue;
  // 誤解を招く子音連続や、表示上の拍の境界を越える音の移動を避ける。
  a.readPhones.pop();b.readPhones.unshift(last);
  setReading(a,renderPhones(a.readPhones,a.stress===0&&!a.beat),'子音と母音の連結');setReading(b,renderPhones(b.readPhones,true),'子音と母音の連結');
 }
 applySoundRules(p);
 applyRhythmNotation(p);
}
// 公開資料の法則を参考に、音素に基づく独自の近似表記を行う。
// 辞書のIPAと英文の原文は変更しない。
function applySoundRules(p){
 for(let wi=0;wi<p.words.length;wi++){
  const t=p.words[wi],next=p.words[wi+1];
  if(t.unknown)continue;
  for(let j=0;j<t.syls.length;j++){
   const a=t.syls[j],prev=t.syls[j-1],ps=a.readPhones;
   if(!ps?.length||a.note==='連結'||a.note==='子音と母音の連結')continue;
   const weak=unstressed(t)||a.stress===0&&!a.beat;
   let change=false;
   // 弱音節の母音間にあるT・Dを、米国英語の弾き音として扱う。
   if(prev&&a.stress===0&&vowels.test(ps[1]||'')&&['T','D'].includes(ps[0])){
    const q=prev.readPhones||[],end=q.at(-1),before=q.at(-2);
    if(ps[0]==='T'&&end==='N'&&vowels.test(before||'')) {q.pop();ps[0]='N';setReading(prev,renderPhones(q,unstressed(t)||prev.stress===0&&!prev.beat),'鼻音後のTの弱化');change=true;}
    else if((vowels.test(end||'')||end==='R'&&vowels.test(before||''))&&q.some(x=>/[12]$/.test(x))){
     // 音節主音を含む/tn/は、閉鎖の後に鼻音を発する形で近似する。
     if(ps[0]==='T'&&ps[1]==='AH0'&&ps[2]==='N'&&ps.length===3){setReading(a,'ッン','鼻音への開放');continue;}
     ps[0]='FL';change=true;
    }
   }
   // 語末のTは、子音の前や休止の直前では開放されないことが多い。
   // 単語の境界で重なるTは、別の連結規則で処理する。
   if(j===t.syls.length-1&&ps.at(-1)==='T'&&(!next||!VSTART(next)&&next.syls[0]?.phones?.[0]!=='T')){ps[ps.length-1]='STOP';change=true;}
   // 語末の弱いR音性母音は、短く丸めた音で近似する。
   if(j===t.syls.length-1&&ps.at(-1)==='ER0'&&!isFunction(t)){
    const base=ps.slice(0,-1).concat('AO0');let r=renderPhones(base,true).replace(/ー$/,'');setReading(a,r,'語末の弱い母音');continue;
   }
   if(change)setReading(a,renderPhones(ps,weak),'音の位置に応じた近似');
  }
 }
}
// ここでは学習者向けの表記だけを変更し、英文の原文や辞書のIPAは変更しない。
// 短い表記は弱い発音の目安であり、単語自体の置換ではない。
const SHORT_WEAK={about:['','バゥ'],and:['ン'],could:['ク'],would:['ウ'],should:['シュ'],to:['トゥ']};
const READABLE_WORDS={serious:['シ','リ','アス'],spain:['スパイン']};
function applyRhythmNotation(p){
 for(const t of p.words){
  const approx=unstressed(t)&&Object.hasOwn(SHORT_WEAK,t.w)?SHORT_WEAK[t.w]:Object.hasOwn(READABLE_WORDS,t.w)?READABLE_WORDS[t.w]:null;
  if(approx&&approx.length===t.syls.length){t.syls.forEach((s,i)=>setReading(s,approx[i],unstressed(t)?'弱い語句の近似表記':'読みやすい近似表記'));}
 }
 // 語境界で重なる閉鎖音は二重に表記しない。
 // want toは二語のままTを一度だけ表し、wannaへの置換は行わない。
 for(let i=0;i<p.words.length-1;i++){
  const a=p.words[i],b=p.words[i+1],sa=a.syls.at(-1),sb=b.syls[0];
  if(!unstressed(b)||a.unknown||b.unknown)continue;
  const end=sa.phones?.at(-1),begin=sb.phones?.[0];
  if(end===begin&&['T','D','K','G','P','B'].includes(end)&&sa.reading.endsWith(CODA[end])&&sb.reading){
   setReading(sa,sa.reading.slice(0,-CODA[end].length),'連続する子音の表記を共有');
  }
 }
}
// 弱い単語のまとまりと強勢のある各単語を分ける。
 // 通常表示では読みやすい単語単位、詳細表示では音節単位で扱う。
function readingUnits(p){
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
function unitText(g){return g.syls.map(s=>s.reading).join('');}

function renderedReading(g,cls='beat-reading'){const e=el('div',cls);for(const s of g.syls){const node=el(s.beat?'strong':'span',(s.word.unknown?'unknown-reading ':'')+(!s.reading?'silent':''),s.reading);node.title=s.word.word+(s.note?' · '+s.note:'');e.append(node);}return e;}
function readingText(g){return g.syls.map(s=>s.reading).join('');}

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
   if(aux||BE_FULL.has(ws[j]?.w))continue;
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
 speechButton.setAttribute('aria-pressed',String(active));
 $('#speak-label').textContent=active?'停止':'全文を再生';
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
 button.disabled=true;button.textContent='解析';
 out.setAttribute('aria-busy','true');
 out.replaceChildren(el('p','dictionary-status','辞書を読み込んでいます…'));
 try{
  const {pronunciation,pos}=document.documentElement.dataset;
  dictionaries=await loadDictionaries(pronunciation,pos);
  dictionaries.onsets.forEach(x=>ON.add(x));
  dictionaryState='ready';button.disabled=false;
  analyze();
 }catch{
  dictionaries=null;dictionaryState='error';button.disabled=false;button.textContent='再読み込み';
  out.replaceChildren(el('p','dictionary-status error','辞書を読み込めませんでした。再読み込みしてください。'));
 }finally{out.setAttribute('aria-busy','false');}
}
initializeDictionaries();
