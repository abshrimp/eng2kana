// 英文・辞書音素・強勢を保持し、発話時に変化する音素列だけを更新する。
// DYは/dʒ/のうちD+Yの融合、FLは弾き音、STOPは開放されないTの近似表記用記号。
const vowel=p=>/[012]$/.test(p||'');
const stressed=p=>/[12]$/.test(p||'');
const fusion={T:'CH',D:'DY',S:'SH',Z:'ZH'};
const stops=new Set(['T','D','K','G','P','B']);
const glideOnsets=new Set(['K','G','P','B','M','N','L','F','V','TH','DH','HH','CH','JH','SH','ZH']);
const linkOnsets=new Set(['B','CH','D','DH','F','G','JH','K','L','M','N','P','S','SH','T','TH','V','Z','ZH']);
const weak=s=>!s.beat&&(s.stress===0||!s.word.syls.some(x=>x.beat));
const mark=(s,note)=>{s.connectedChanged=true;s.note=[s.note,note].filter(Boolean).join('・');};
const valid=s=>s&&!s.word.unknown&&Array.isArray(s.readPhones)&&s.readPhones.length>0;
const hasVowel=ps=>ps.some(vowel);
const lastVowelBefore=(ps,index)=>{for(let i=index-1;i>=0;i--)if(vowel(ps[i]))return ps[i];return '';};

export function applyConnectedSpeech(phrase){
 // 句読点・未知語・未対応文字を越えて音を連結しない。
 const order=new Map(phrase.tokens.map((t,i)=>[t,i]));
 const pairs=new Map();
 for(let i=0;i+1<phrase.words.length;i++){
  const left=phrase.words[i],right=phrase.words[i+1];
  if(order.get(right)!==order.get(left)+1)continue;
  const a=left.syls.at(-1),b=right.syls[0];
  if(valid(a)&&valid(b))pairs.set(a,b);
 }
 // 語内・語間の歯茎音＋Yを融合させる。休止を挟む場合は適用しない。
 for(const s of phrase.syls){
  if(!valid(s))continue;
  const ps=s.readPhones;
  for(let i=0;i+1<ps.length;i++){
   if(Object.hasOwn(fusion,ps[i])&&ps[i+1]==='Y'&&vowel(ps[i+2])){
    ps.splice(i,2,fusion[ps[i]]);mark(s,'子音とYの融合');
   }
  }
 }
 for(const [a,b] of pairs){
  const left=a.readPhones,right=b.readPhones,end=left.at(-1),begin=right[0];
  if(begin==='Y'&&vowel(right[1])){
   if(Object.hasOwn(fusion,end)){
    left.pop();right[0]=fusion[end];mark(a,'子音とYの融合');mark(b,'子音とYの融合');continue;
   }
   // thank you、if you're 等では子音＋Yを一つの拗音として表せる位置へ移す。
   if(glideOnsets.has(end)&&hasVowel(left)){
    left.pop();right.unshift(end);mark(a,'子音とYの連結');mark(b,'子音とYの連結');continue;
   }
  }
  // 同じ閉鎖音が続く場合は閉鎖を二重に表記しない。
  if(end===begin&&stops.has(end)&&hasVowel(left)){
   left.pop();mark(a,'連続する閉鎖音');continue;
  }
  // 母音間のT・Dは、後続が弱い場合には弾き音になり得る。
  // 後続音節へ移動する前に判定することで、get it等にも語内と同じ規則を適用する。
  if(vowel(begin)&&linkOnsets.has(end)&&hasVowel(left)){
   const prev=left.at(-2);
   const flap=(end==='T'||end==='D')&&weak(b)&&stressed(prev);
   left.pop();right.unshift(flap?'FL':end);
   mark(a,flap?'母音間の弾き音':'子音と母音の連結');
   mark(b,flap?'母音間の弾き音':'子音と母音の連結');
  }
 }
 // 語内の弱音節に対して、鼻音後のTの弱化・弾き音・鼻音への開放を処理する。
 for(const t of phrase.words){
  if(t.unknown)continue;
  for(let i=1;i<t.syls.length;i++){
   const a=t.syls[i-1],b=t.syls[i],left=a.readPhones,right=b.readPhones;
   if(!valid(a)||!valid(b)||b.beat||b.stress!==0||!['T','D'].includes(right[0])||!vowel(right[1]))continue;
   const end=left.at(-1),prev=left.at(-2);
   if(right[0]==='T'&&end==='N'&&vowel(prev)){
    left.pop();right[0]='N';mark(a,'鼻音後のTの弱化');mark(b,'鼻音後のTの弱化');
   }else if((vowel(end)||end==='R'&&vowel(prev))&&stressed(lastVowelBefore(left,left.length))){
    if(right[0]==='T'&&right[1]==='AH0'&&right[2]==='N'&&right.length===3){
     right.splice(0,3,'STOP','N');mark(b,'鼻音への開放');
    }else{
     right[0]='FL';mark(b,'母音間の弾き音');
    }
   }
  }
 }
 // 融合・連結の後で、残った語末Tの閉鎖を処理する。
 for(const t of phrase.words){
  const s=t.syls.at(-1);
  if(!valid(s)||s.readPhones.at(-1)!=='T')continue;
  const next=pairs.get(s);
  if(!next||!vowel(next.readPhones[0])){
   s.readPhones[s.readPhones.length-1]='STOP';mark(s,'語末Tの弱化');
  }
 }
}
