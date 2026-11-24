import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDictionaries,loadDictionaries} from '../public/dictionary.mjs';
const manifest=JSON.parse(readFileSync(new URL('./dictionary-integrity.json',import.meta.url),'utf8'));
const read=name=>readFileSync(new URL('../public/dictionaries/'+name,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const pText=read(manifest.pronunciation),tText=read(manifest.pos);
const p=JSON.parse(pText),t=JSON.parse(tText);

test('発音辞書・品詞辞書の全件を欠損なく復号できる',()=>{
 const d=createDictionaries(p,t);
 const words=Object.fromEntries(Object.keys(p.words).map(w=>[w,d.pronunciations(w)]));
 const tags=Object.fromEntries(Object.keys(t.words).map(w=>[w,d.tag(w)]));
 assert.equal(Object.keys(words).length,manifest.counts.pronunciation);
 assert.equal(Object.values(words).reduce((sum,v)=>sum+v.length,0),manifest.counts.variants);
 assert.equal(Object.keys(tags).length,manifest.counts.pos);
 assert.equal(d.onsets.length,manifest.counts.onsets);
 assert.equal(hash(JSON.stringify(words)),manifest.sha256.dictionary);
 assert.equal(hash(JSON.stringify(tags)),manifest.sha256.posdata);
 assert.equal(hash(JSON.stringify(d.onsets)),manifest.sha256.onsets);
 assert.equal(d.has('zzzzunknown'),false);
 assert.equal(d.pronunciations('zzzzunknown'),null);
 assert.equal(d.tag('zzzzunknown'),null);
});
test('辞書のハッシュ付きURLとHTML参照の整合性',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const [name,content] of [[manifest.pronunciation,pText],[manifest.pos,tText]]){
  assert.ok(name.includes(hash(content).slice(0,16)));
  assert.ok(html.includes('/dictionaries/'+name));
 }
 assert.ok(!html.includes('id="dictionary"'));
});
test('並列取得と辞書読み込み失敗時の処理',async()=>{
 const calls=[];
 const d=await loadDictionaries('p','t',async url=>{calls.push(url);return Response.json(url==='p'?p:t);});
 assert.deepEqual(calls,['p','t']);
 assert.deepEqual(d.pronunciations('computer'),['K AH0 M P Y UW1 T ER0']);
 assert.equal(d.tag('computer'),'NN');
 await assert.rejects(loadDictionaries('p','t',async()=>new Response('',{status:503})));
 assert.throws(()=>createDictionaries({format:0},t));
});
