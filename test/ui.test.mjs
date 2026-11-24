import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {PLAYBACK_RATES,normalizePlaybackRate,restorePlaybackRate,storePlaybackRate,applyPlaybackRate} from '../public/playback-rate.mjs';

const asset=name=>readFileSync(new URL('../public/'+name,import.meta.url));
const html=asset('index.html').toString();

test('再生速度の選択肢・復元・保存と音程維持',()=>{
 const rates=[...html.matchAll(/<option value="([\d.]+)"(?: selected)?>[\d.]+×<\/option>/g)].map(m=>Number(m[1]));
 assert.deepEqual(rates,PLAYBACK_RATES);
 for(const rate of rates){
  const audio={preservesPitch:false,webkitPreservesPitch:false};
  assert.equal(applyPlaybackRate(audio,String(rate)),rate);
  assert.equal(audio.playbackRate,rate);
  assert.equal(audio.defaultPlaybackRate,rate);
  assert.equal(audio.preservesPitch,true);
  assert.equal(audio.webkitPreservesPitch,true);
 }
 for(const value of [null,'NaN',0,100,'1.123'])assert.equal(normalizePlaybackRate(value),1);
 const values=new Map(),host={localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
 assert.equal(restorePlaybackRate(host),1);
 storePlaybackRate(host,0.75);assert.equal(restorePlaybackRate(host),0.75);
 const unavailable={get localStorage(){throw Error('保存不可');}};
 assert.equal(restorePlaybackRate(unavailable),1);assert.doesNotThrow(()=>storePlaybackRate(unavailable,1.5));
});

test('主画面とモーダルのアクセシブルな構造・不要な折りたたみの削除',()=>{
 assert.doesNotMatch(html,/<details\b|表記について/);
 assert.match(html,/<dialog id="settings-dialog"[^>]*aria-labelledby="dialog-title"/);
 assert.match(html,/id="open-settings"[^>]*aria-haspopup="dialog"/);
 assert.match(html,/id="open-beats"[^>]*aria-haspopup="dialog"/);
 for(const name of ['settings','beats']){
  assert.match(html,new RegExp('id="tab-'+name+'"[^>]*aria-controls="panel-'+name+'"'));
  assert.match(html,new RegExp('id="panel-'+name+'"[^>]*aria-labelledby="tab-'+name+'"'));
 }
 assert.match(html,/<select id="playback-rate"[^>]*aria-label="再生速度"/);
 assert.match(html,/href="\/dictionary-notices.txt"/);
 assert.match(html,/href="\/privacy.html"/);
});

function verifyPng(buffer,width,height){
 assert.deepEqual([...buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(buffer.readUInt32BE(16),width);
 assert.equal(buffer.readUInt32BE(20),height);
 assert.equal(buffer[24],8);assert.equal(buffer[25],3);
 let offset=8;const chunks=[];let end=false;
 while(offset+12<=buffer.length){
  const size=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8);
  assert.ok(offset+size+12<=buffer.length);
  if(type==='IDAT')chunks.push(buffer.subarray(offset+8,offset+8+size));
  offset+=size+12;
  if(type==='IEND'){end=true;break;}
 }
 assert.ok(end&&offset===buffer.length&&chunks.length);
 const raw=inflateSync(Buffer.concat(chunks));
 assert.equal(raw.length,(width+1)*height);
 for(let y=0;y<height;y++)assert.equal(raw[y*(width+1)],0);
}

test('OGP・Twitterカード・アイコンの設定と実画像の整合性',()=>{
 assert.match(html,/property="og:url" content="https:\/\/eng2kana\.ebii\.net\/"/);
 assert.match(html,/property="og:image" content="https:\/\/eng2kana\.ebii\.net\/og\.png"/);
 assert.match(html,/name="twitter:card" content="summary_large_image"/);
 assert.match(html,/name="twitter:image" content="https:\/\/eng2kana\.ebii\.net\/og\.png"/);
 assert.match(html,/property="og:image:width" content="1200"/);
 assert.match(html,/property="og:image:height" content="630"/);
 assert.match(html,/property="og:image:alt" content="英語 to カタカナ 変換器/);
 assert.match(html,/name="twitter:image:alt" content="英語 to カタカナ 変換器/);
 verifyPng(asset('og.png'),1200,630);
 verifyPng(asset('apple-touch-icon.png'),180,180);
 const ico=asset('favicon.ico');
 assert.equal(ico.readUInt16LE(2),1);
 assert.equal(ico[6],48);assert.equal(ico[7],48);
 verifyPng(ico.subarray(ico.readUInt32LE(18)),48,48);
 assert.match(asset('favicon.svg').toString(),/<svg[^>]*viewBox="0 0 64 64"/);
});
