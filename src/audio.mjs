import { Buffer } from 'node:buffer';
const MAX_BYTES = 5000;
export function splitText(text, limit = MAX_BYTES) {
  const chunks = [];
  let rest = text.trim();
  while (Buffer.byteLength(rest) > limit) {
    let size = 0, end = 0;
    for (const ch of rest) {
      const n = Buffer.byteLength(ch);
      if (size + n > limit) break;
      size += n; end += ch.length;
    }
    const prefix = rest.slice(0, end);
    const sentence = [...prefix.matchAll(/[.!?](?:["'”’)]*)\s+|\n+/g)].at(-1);
    const space = [...prefix.matchAll(/\s+/g)].at(-1);
    const cut = sentence && sentence.index >= end * .4 ? sentence.index + sentence[0].length : space && space.index >= end * .4 ? space.index + space[0].length : end;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

// LINEAR16の応答はWAV形式。ヘッダーではなくPCM音声データを連結する。
function parseWav(b) {
  if (b.length < 12 || b.toString('ascii',0,4)!=='RIFF' || b.toString('ascii',8,12)!=='WAVE') throw new Error('Invalid WAV');
  let fmt, pcm;
  for (let i=12;i+8<=b.length;) {
    const name=b.toString('ascii',i,i+4), len=b.readUInt32LE(i+4), end=i+8+len;
    if(end>b.length)throw new Error('Invalid WAV chunk');
    if(name==='fmt ')fmt=b.subarray(i+8,end);
    if(name==='data')pcm=b.subarray(i+8,end);
    i=end+(len&1);
  }
  if(!fmt||fmt.length<16||!pcm||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(14)!==16)throw new Error('Unsupported WAV format');
  return {fmt,pcm};
}
export function joinWav(buffers) {
  const parts=buffers.map(parseWav), fmt=parts[0].fmt;
  if(parts.some(p=>!p.fmt.equals(fmt)))throw new Error('Audio format mismatch');
  const pcm=Buffer.concat(parts.map(p=>p.pcm));
  const fmtPad=fmt.length&1, pcmPad=pcm.length&1;
  const out=Buffer.alloc(12+8+fmt.length+fmtPad+8+pcm.length+pcmPad);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(fmt.length,16);fmt.copy(out,20);
  const i=20+fmt.length+fmtPad;out.write('data',i);out.writeUInt32LE(pcm.length,i+4);pcm.copy(out,i+8);return out;
}
