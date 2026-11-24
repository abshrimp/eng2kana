import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDictionaries} from '../public/dictionary.mjs';
import {setDictionaries,makeModel,readings,readingUnits,unitText} from '../public/analysis.mjs';
const manifest=JSON.parse(readFileSync(new URL('./dictionary-integrity.json',import.meta.url),'utf8'));
const read=name=>JSON.parse(readFileSync(new URL('../public/dictionaries/'+name,import.meta.url),'utf8'));
setDictionaries(createDictionaries(read(manifest.pronunciation),read(manifest.pos)));
function analyze(text,natural=true){const m=makeModel(text,'normal');m.phrases.forEach(p=>readings(p,natural));return m;}
function pair(text,a,b,natural=true){
 const m=analyze(text,natural);
 const i=m.words.findIndex(w=>w.w===a),left=m.words[i],right=m.words[i+1];
 assert.equal(right.w,b);
 return {left,right,reading:[...left.syls,...right.syls].map(s=>s.reading).join('')};
}
test('Yとの融合は単語ではなく子音の組み合わせで判定する',()=>{
 for(const [text,a,b,phone] of [
  ['did you','did','you','DY'],['could you','could','you','DY'],
  ['would you','would','you','DY'],['should you','should','you','DY'],
  ['I need you.','need','you','DY'],['I hate you.','hate','you','CH'],
  ["don't you","don't",'you','CH'],['I miss you.','miss','you','SH'],
  ['as you','as','you','ZH'],['this year','this','year','SH']
 ]){
  const {left,right}=pair(text,a,b);
  assert.equal(right.syls[0].readPhones[0],phone,text);
  assert.notEqual(left.syls.at(-1).readPhones.at(-1),left.syls.at(-1).phones.at(-1),text);
 }
 assert.equal(pair('did you','did','you').reading,'ディヂュ');
 assert.equal(pair('could you','could','you').reading,'クヂュ');
});
test('拗音と英字の併用・閉鎖音の共有は一貫した規則で表す',()=>{
 assert.equal(pair("if you're","if","you're").reading,'イfュア');
 assert.ok(pair('thank you','thank','you').reading.endsWith('キュ'));
 assert.equal(pair('I want to go home.','want','to').reading,'ワントゥ');
 assert.ok(pair('I like you.','like','you').reading.endsWith('キュ'));
 assert.equal(analyze('food').words[0].syls.map(s=>s.reading).join(''),'fゥード');
});
test('弾き音は語内・語間の両方で処理し、休止・強い後続母音を区別する',()=>{
 const m=analyze('water');
 assert.ok(m.all.some(s=>s.readPhones.includes('FL')));
 assert.ok(pair('get it','get','it').right.syls[0].readPhones.includes('FL'));
 assert.ok(!pair('get up','get','up').right.syls[0].readPhones.includes('FL'));
 assert.ok(!analyze('get, it').all.some(s=>s.readPhones?.includes('FL')));
});
test('自然な表記を無効にした場合は融合せず、手動調整後も元の音素を保持する',()=>{
 const raw=pair('did you','did','you',false);
 assert.equal(raw.left.syls.at(-1).readPhones.at(-1),'D');
 assert.equal(raw.right.syls[0].readPhones[0],'Y');
 const m=analyze('did you');
 const original=m.all.map(s=>s.phones.slice());
 readings(m.phrases[0],false);
 assert.deepEqual(m.all.map(s=>s.readPhones),original);
 readings(m.phrases[0],true);
 assert.deepEqual(m.all.map(s=>s.phones),original);
 assert.equal(m.phrases.flatMap(readingUnits).map(unitText).join(''),'ディヂュ');
});
test('句読点・未知語を越えた融合はしない',()=>{
 const m=analyze('did, you');
 assert.equal(m.words[0].syls.at(-1).readPhones.at(-1),'D');
 assert.equal(m.words[1].syls[0].readPhones[0],'Y');
 assert.ok(!analyze('did zzzzzzz you').all.some(s=>s.readPhones?.includes('DY')));
});
test('既存の弱形・動詞着色と元の語順を維持する',()=>{
 const text="If you're serious about Spain, we could leave tomorrow.";
 const m=analyze(text);
 assert.equal(m.words.map(w=>w.word).join(' '),"If you're serious about Spain we could leave tomorrow");
 assert.deepEqual(m.words.filter(w=>w.predicateRole).map(w=>w.w),['serious','leave']);
 assert.equal(pair("if you're","if","you're").reading,'イfュア');
 assert.equal(m.words.find(w=>w.w==='about').syls.map(s=>s.reading).join(''),'バゥ');
 assert.equal(m.words.find(w=>w.w==='could').syls.map(s=>s.reading).join(''),'ク');
 assert.equal(analyze('bread and butter').words.find(w=>w.w==='and').syls.map(s=>s.reading).join(''),'ン');
});
test('通常画面は自動解析を前提とし、アイコン操作に名前を付ける',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="analyze"[^>]*hidden/);
 for(const [id,label] of [['clear','入力をクリア'],['copy','発音をコピー']]){
  assert.match(html,new RegExp('id="'+id+'"[^>]*aria-label="'+label+'"'));
 }
 assert.match(html,/id="speak-label">全文を再生/);
});
