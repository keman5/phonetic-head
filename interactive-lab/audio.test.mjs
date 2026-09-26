import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOUNDS} from './dist/motion.js';

const root=new URL('./dist/assets/audio/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
function wave(path){
 const b=readFileSync(new URL(path,root));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
 let format,data;
 for(let at=12;at+8<=b.length;){const n=b.readUInt32LE(at+4),chunk=b.subarray(at+8,at+8+n),id=b.toString('ascii',at,at+4);if(id==='fmt ')format=chunk;if(id==='data')data=chunk;at+=8+n+(n%2);}
 assert(format&&data);assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(2),1);assert.equal(format.readUInt16LE(14),16);
 return {b,data,rate:format.readUInt32LE(4),duration:data.length/2/format.readUInt32LE(4)};
}
test('both voices contain audible PCM for every supported sound, with accurate durations',()=>{
 assert.equal(Object.keys(SOUNDS).length,75);assert(!SOUNDS.p);
 for(const [voice,v] of Object.entries(manifest.voices)){
  assert.deepEqual(Object.keys(v.entries).sort(),Object.keys(SOUNDS).map(s=>s.replace(':','-')).sort());
  for(const [key,e] of Object.entries(v.entries)){
   const w=wave(voice+'/'+key+'.wav');assert.equal(w.rate,manifest.sampleRate);assert(Math.abs(w.duration-e.duration)<1e-6);
   assert.equal(createHash('sha256').update(w.b).digest('hex'),e.sha256);
   let energy=0,active=0;for(let i=0;i<w.data.length;i+=2){const n=w.data.readInt16LE(i);energy+=n*n;if(Math.abs(n)>40)active++;}
   assert(active>100&&energy>1e6,voice+'/'+key+' must contain sound');
  }
 }
 const a=wave('female/ipa-i.wav'),b=wave('male/ipa-i.wav');assert.notDeepEqual(a.data,b.data);
});
test('alphabet intervals correspond exactly to the individual letter recordings',()=>{
 for(const [voice,v] of Object.entries(manifest.voices)){
  const alphabet=wave(voice+'/alphabet.wav');const segments=v.entries.alphabet.segments;
  assert.equal(segments.map(s=>s.letter).join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  for(const s of segments){const w=wave(voice+'/letter-'+s.letter+'.wav');assert(Math.abs(s.end-s.start-w.duration)<1e-6);const at=Math.round(s.start*alphabet.rate)*2;assert.deepEqual(alphabet.data.subarray(at,at+w.data.length),w.data);}
 }
});
test('isolated long/short vowels retain distinct phoneme inputs and clear voiced durations',()=>{
 function activeDuration(w){
  let first=-1,last=0;
  for(let at=0;at<w.data.length;at+=2)if(Math.abs(w.data.readInt16LE(at))>40){if(first<0)first=at/2;last=at/2;}
  return (last-first+1)/w.rate;
 }
 for(const [voice,{entries}] of Object.entries(manifest.voices)){
  for(const [long,short,longCode,shortCode] of [['i','ih',"'i:","'I"],['u','uu',"'u:","'U"]]){
   const a=entries['ipa-'+long],b=entries['ipa-'+short];
   assert.equal(a.synthesisInput,longCode);assert.equal(b.synthesisInput,shortCode);
   const longDuration=activeDuration(wave(voice+'/ipa-'+long+'.wav'));
   const shortDuration=activeDuration(wave(voice+'/ipa-'+short+'.wav'));
   assert(longDuration/shortDuration>=1.8,voice+' '+long+'/'+short);
   assert(longDuration-shortDuration>=.18);
   assert(Math.abs(a.activeDuration-longDuration)<1e-6);
  }
 }
});
