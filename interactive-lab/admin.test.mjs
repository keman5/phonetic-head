import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './server.mjs';
import {inspectAudio} from './speech.mjs';

const password='Classroom-test-916!';
export function wave(seconds=.3) {
  const size=Math.round(seconds*24000)*2,bytes=Buffer.alloc(44+size);
  bytes.write('RIFF');bytes.writeUInt32LE(36+size,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(24000,24);bytes.writeUInt32LE(48000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(size,40);
  for(let i=0;i<size/2;i++)bytes.writeInt16LE(Math.round(Math.sin(i/24000*440*2*Math.PI)*2000),44+i*2);return bytes;
}
async function fixture(t,options={}) {
  const dataDir=await mkdtemp(join(tmpdir(),'classroom-admin-test-'));
  let app,base,cookie='',csrf='';
  async function start(){app=createApp({dataDir,...options});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.address().port;}
  await start();
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));await rm(dataDir,{recursive:true,force:true});});
  const call=async(path,{method='GET',data,bytes,headers={},auth=true}={})=>{
    const response=await fetch(base+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),Origin:base,...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...headers},body:bytes|| (data?JSON.stringify(data):undefined)});
    return response;
  };
  async function login(pass='111111') {
    const response=await call('/api/admin/login',{method:'POST',data:{username:'admin',password:pass},auth:false});assert.equal(response.status,200);
    cookie=response.headers.get('set-cookie').split(';')[0];const result=await response.json();csrf=result.csrf;return result;
  }
  async function authorize() {
    await login();const response=await call('/api/admin/password',{method:'POST',data:{currentPassword:'111111',password}});assert.equal(response.status,200);await login(password);
  }
  return {call,login,authorize,dataDir,get base(){return base;},async restart(){await new Promise(resolve=>app.close(resolve));await start();},state:async()=>{const response=await call('/api/admin/state');assert.equal(response.status,200);return response.json();}};
}
const save=async(f,id,record,course=record.draft)=>{const response=await f.call('/api/admin/courses/'+id,{method:'PUT',data:{revision:record.revision,course}});assert.equal(response.status,200,await response.clone().text());return response.json();};
const publish=(f,id,record)=>f.call(`/api/admin/courses/${id}/publish`,{method:'POST',data:{revision:record.revision}});

test('admin sessions enforce role, default password rotation, origins, CSRF and logout',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call('/api/admin/state',{auth:false})).status,401);
  assert.equal((await f.call('/api/admin/login',{method:'POST',data:{username:'admin',password:'111111'},headers:{Origin:'https://attacker.test'}})).status,403);
  const identity=await f.login();assert.equal(identity.role,'admin');assert(identity.mustChangePassword);
  assert.equal((await f.call('/api/admin/state')).status,403);
  assert.equal((await f.call('/api/admin/password',{method:'POST',data:{currentPassword:'111111',password},headers:{'X-CSRF-Token':'wrong'}})).status,403);
  assert.equal((await f.call('/api/admin/password',{method:'POST',data:{currentPassword:'111111',password:'short'}})).status,400);
  await f.authorize();assert.equal(Object.keys((await f.state()).courses).length,10);
  assert.equal((await f.call('/api/admin/logout',{method:'POST',data:{}})).status,200);
  assert.equal((await f.call('/api/admin/state')).status,401);
  const disk=await readFile(join(f.dataDir,'store.json'),'utf8');assert(!disk.includes(password));assert(!disk.includes('111111'));assert.equal((await stat(join(f.dataDir,'store.json'))).mode&0o777,0o600);
});

test('login attempts are bounded without sending requests to any AI provider',async t=>{
  const f=await fixture(t);
  for(let i=0;i<10;i++)assert.equal((await f.call('/api/admin/login',{method:'POST',data:{username:'admin',password:'wrong'}})).status,401);
  assert.equal((await f.call('/api/admin/login',{method:'POST',data:{username:'admin',password:'111111'}})).status,429);
});

test('draft edits remain private, stale writes conflict and published content survives restart',async t=>{
  const f=await fixture(t);await f.authorize();let record=(await f.state()).courses.dog;
  const initial=structuredClone(record);record.draft.title='公园 "问候" 课堂';record=await save(f,'dog',record);
  assert.equal((await f.call('/api/admin/courses/dog',{method:'PUT',data:{revision:initial.revision,course:initial.draft}})).status,409);
  assert.equal((await(await f.call('/api/curriculum',{auth:false})).json()).series[0].title,initial.draft.title);
  assert.equal((await publish(f,'dog',record)).status,200);
  await f.restart();
  assert.equal((await f.call('/api/admin/state')).status,401);await f.login(password);
  const catalog=await(await f.call('/api/curriculum',{auth:false})).json();assert.equal(catalog.series[0].title,'公园 "问候" 课堂');assert(!JSON.stringify(catalog).includes('hash'));assert(!JSON.stringify(catalog).includes('apiKey'));
  const invalid=(await f.state()).courses.dog;invalid.draft.scene.place='<img src=x onerror=alert(1)>';
  assert.equal((await f.call('/api/admin/courses/dog',{method:'PUT',data:{revision:invalid.revision,course:invalid.draft}})).status,400);
});

test('changed text cannot publish with old audio; validated uploads publish both voices with new timings',async t=>{
  const f=await fixture(t);await f.authorize();let record=(await f.state()).courses.dog;
  const lesson=record.draft.lessons[3];lesson.text='Hello, my friend!';lesson.audioPhonemes=[[],[],[]];record=await save(f,'dog',record);
  assert.equal((await publish(f,'dog',record)).status,422);
  assert.equal((await f.call('/api/admin/courses/dog/upload?stage=sentence&voice=female',{method:'POST',bytes:Buffer.from('<html>bad</html>'),headers:{'X-Course-Revision':String(record.revision)}})).status,400);
  for(const voice of ['female','male']) {
    const response=await f.call(`/api/admin/courses/dog/upload?stage=sentence&voice=${voice}`,{method:'POST',bytes:wave(.4),headers:{'X-Course-Revision':String(record.revision)}});assert.equal(response.status,200);record=await response.json();
  }
  const asset=Object.values((await f.state()).assets)[0];assert.equal((await f.call(`/api/media/${asset.id}.wav`,{auth:false})).status,404);
  assert.equal((await publish(f,'dog',record)).status,200);
  const catalog=await(await f.call('/api/curriculum')).json(),audio=catalog.lessons['dog-sentence'].audio.female;
  assert.equal(catalog.lessons['dog-sentence'].text,'Hello, my friend!');assert.equal(audio.entry.clips.length,0);assert.equal(audio.entry.duration,.4);
  const resolved=await(await f.call(audio.resolveURL,{auth:false})).json();assert.equal((await f.call(resolved.url,{auth:false})).status,200);
  const file=new URL(audio.resolveURL,f.base);file.pathname+='/file';assert.equal((await fetch(file)).headers.get('content-type'),'audio/wav');
  record=(await f.state()).courses.dog;record.draft.lessons[3].text='Hello, new friend!';record=await save(f,'dog',record);assert.equal((await publish(f,'dog',record)).status,422);
});

test('new courses reuse unchanged recordings and unpublishing does not delete their drafts',async t=>{
  const f=await fixture(t);await f.authorize();
  assert.equal((await f.call('/api/admin/courses',{method:'POST',data:{id:'greetings',templateId:'dog'}})).status,201);
  let record=(await f.state()).courses.greetings;
  assert.equal(record.draft.lessons[0].audio.female.builtinId,'dog-sound');assert.equal((await publish(f,'greetings',record)).status,200);
  assert.equal((await(await f.call('/api/curriculum')).json()).series.length,11);
  record=(await f.state()).courses.greetings;
  assert.equal((await f.call('/api/admin/courses/greetings/unpublish',{method:'POST',data:{revision:record.revision}})).status,200);
  assert.equal((await(await f.call('/api/curriculum')).json()).series.length,10);assert((await f.state()).courses.greetings.draft);
  assert.equal((await f.call('/api/admin/courses',{method:'POST',data:{id:'constructor',templateId:'dog'}})).status,400);
});

test('both TTS providers use fixed endpoints; dynamic requests cache, coalesce, redact keys and enforce budget',async t=>{
  const calls=[];let failUpstream=false;
  const f=await fixture(t,{fetchImpl:async(url,options)=>{
    calls.push({url,options});if(failUpstream)return new Response('sensitive provider details',{status:401});
    if(url.includes('elevenlabs.io')) {
      const {text}=JSON.parse(options.body);const characters=[...text],step=.4/characters.length;
      return Response.json({audio_base64:wave(.5).subarray(44).toString('base64'),alignment:{characters,character_start_times_seconds:characters.map((_,i)=>i*step),character_end_times_seconds:characters.map((_,i)=>(i+1)*step)}});
    }
    return new Response(wave(.6),{headers:{'Content-Type':'audio/wav'}});
  }});await f.authorize();
  let config=(await f.state()).config;
  config.elevenlabs={...config.elevenlabs,apiKey:'eleven-secret',female:'voice-f',male:'voice-m'};config.azure={...config.azure,apiKey:'azure-secret'};
  let response=await f.call('/api/admin/config',{method:'PUT',data:config});assert.equal(response.status,200);assert(!JSON.stringify(await response.json()).includes('secret'));
  let record=(await f.state()).courses.dog;
  record.draft.lessons[3].audio.female={source:'elevenlabs',mode:'dynamic'};record.draft.lessons[3].audio.male={source:'azure',mode:'dynamic'};
  record=await save(f,'dog',record);assert.equal((await publish(f,'dog',record)).status,200);assert.equal(calls.length,0,'Publishing must not generate speech');
  const catalog=await(await f.call('/api/curriculum')).json();assert(!JSON.stringify(catalog).includes('secret'));const audio=catalog.lessons['dog-sentence'].audio;
  const requests=await Promise.all([f.call(audio.female.resolveURL,{auth:false}),f.call(audio.female.resolveURL,{auth:false})]);
  for(const result of requests)assert.equal(result.status,200);assert.equal(calls.length,1);
  const generated=await requests[0].json();assert.equal(generated.entry.timingSource,'word-aligned');assert.equal(generated.entry.phonemeTiming,'illustrative');assert(generated.entry.clips.length>0);
  await f.call(audio.female.resolveURL,{auth:false});assert.equal(calls.length,1);await f.call(audio.male.resolveURL,{auth:false});assert.equal(calls.length,2);
  assert.match(calls[0].url,/^https:\/\/api.elevenlabs.io\/v1\/text-to-speech\/voice-f\/with-timestamps/);assert.equal(calls[0].options.headers['xi-api-key'],'eleven-secret');
  assert.equal(calls[1].url,'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');assert.match(calls[1].options.body,/<voice name="en-GB-RyanNeural">This is a big dog\.<\/voice>/);
  assert.equal((await f.call('/api/admin/courses/dog/generate',{method:'POST',auth:false,data:{stage:'sentence',voice:'female',provider:'elevenlabs'}})).status,401);
  assert.equal((await f.call('/api/lesson-audio/anything/female?revision=1',{auth:false})).status,404);
  await f.restart();await f.login(password);await f.call(audio.female.resolveURL,{auth:false});assert.equal(calls.length,2,'Cache survives a process restart');
  config=(await f.state()).config;config.dailyCharacterLimit=0;config.azure.apiKey='';config.elevenlabs.apiKey='';assert.equal((await f.call('/api/admin/config',{method:'PUT',data:config})).status,200);
  record=(await f.state()).courses.cat;record.draft.lessons[3].audio.female={source:'azure',mode:'dynamic'};record=await save(f,'cat',record);assert.equal((await publish(f,'cat',record)).status,200);
  const cat=(await(await f.call('/api/curriculum')).json()).lessons['cat-sentence'].audio.female;
  assert.equal((await f.call(cat.resolveURL,{auth:false})).status,429);assert.equal(calls.length,2);
  config=(await f.state()).config;config.dailyCharacterLimit=10000;config.azure.apiKey='';config.elevenlabs.apiKey='';await f.call('/api/admin/config',{method:'PUT',data:config});
  failUpstream=true;response=await f.call(cat.resolveURL,{auth:false});assert.equal(response.status,502);assert(!JSON.stringify(await response.json()).includes('sensitive'));
});

test('audio validation rejects truncated WAV, overlong clips and non-audio payloads',()=>{
  assert.equal(inspectAudio(wave(.3)).duration,.3);
  for(const bytes of [wave(.3).subarray(0,70),wave(121),Buffer.from('ID3broken'),Buffer.from('<script>alert(1)</script>')])assert.throws(()=>inspectAudio(bytes));
  const frame=Buffer.alloc(417);frame.set([0xff,0xfb,0x90,0]);const audio=inspectAudio(Buffer.concat([frame,frame,frame]));assert.equal(audio.format,'mp3');assert(Math.abs(audio.duration-3*1152/44100)<1e-9);
});

test('admin generation saves provider audio in the draft and publication exposes it without another AI call',async t=>{
  let calls=0;
  const f=await fixture(t,{fetchImpl:async url=>{calls++;return url.includes('elevenlabs')?Response.json({audio_base64:wave(.5).subarray(44).toString('base64')}):new Response(wave(.5));}});await f.authorize();
  const config=(await f.state()).config;config.azure.apiKey='azure-key';config.elevenlabs={...config.elevenlabs,apiKey:'eleven-key',female:'female-id',male:'male-id'};
  assert.equal((await f.call('/api/admin/config',{method:'PUT',data:config})).status,200);
  let record=(await f.state()).courses.dog;
  for(const [provider,voice] of [['elevenlabs','female'],['azure','male']]) {
    const response=await f.call('/api/admin/courses/dog/generate',{method:'POST',data:{revision:record.revision,stage:'sentence',voice,provider}});assert.equal(response.status,200);record=await response.json();
    const audio=record.draft.lessons[3].audio[voice];assert.equal(audio.mode,'saved');assert.equal(audio.source,provider);assert(audio.assetId);
  }
  assert.equal(calls,2);assert.equal((await publish(f,'dog',record)).status,200);
  const catalog=await(await f.call('/api/curriculum')).json();
  for(const voice of ['female','male'])assert.equal((await f.call(catalog.lessons['dog-sentence'].audio[voice].resolveURL,{auth:false})).status,200);
  assert.equal(calls,2);
});
