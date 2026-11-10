import {readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {digest, fail, voices} from './course-store.mjs';
import {PHONEMES} from './dist/phonemes.js';

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export function inspectAudio(bytes) {
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) fail(400,'音频必须小于 20 MB。');
  let duration, format;
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WAVE') {
    let byteRate, dataSize, encoding;
    for (let at=12;at+8<=bytes.length;) {
      const size=bytes.readUInt32LE(at+4),tag=bytes.toString('ascii',at,at+4);
      if (at+8+size>bytes.length) fail(400,'WAV 文件不完整。');
      if (tag==='fmt ' && size>=16) {encoding=bytes.readUInt16LE(at+8);byteRate=bytes.readUInt32LE(at+16);}
      if (tag==='data') dataSize=size;
      at+=8+size+(size%2);
    }
    if (encoding!==1 || !byteRate || !dataSize) fail(400,'请上传 PCM WAV 或 MP3 音频。');
    duration=dataSize/byteRate;format='wav';
  } else {
    // Read MPEG Layer III frames rather than trusting a browser-supplied duration.
    let at=0,frames=0,total=0;
    if (bytes.toString('ascii',0,3)==='ID3' && bytes.length>=10) {
      if ([6,7,8,9].some(i=>bytes[i]&128)) fail(400,'MP3 标签损坏。');
      at=10+((bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9])+(bytes[5]&16?10:0);
    }
    while (at+4<=bytes.length) {
      if (bytes.toString('ascii',at,at+3)==='TAG' && bytes.length-at===128) break;
      if (bytes[at]===0 && bytes.subarray(at).every(value=>value===0)) break;
      const header=bytes.readUInt32BE(at),version=(header>>>19)&3,layer=(header>>>17)&3,index=(header>>>12)&15,sample=(header>>>10)&3;
      if ((header>>>21)!==2047 || version===1 || layer!==1 || index===0 || index===15 || sample===3) fail(400,'请上传有效的 PCM WAV 或 MP3 音频。');
      const rate=[44100,48000,32000][sample]/(version===3?1:version===2?2:4);
      const bitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[index]*1000;
      const size=Math.floor((version===3?144:72)*bitrate/rate)+((header>>>9)&1);
      if (at+size>bytes.length) fail(400,'MP3 文件不完整。');
      at+=size;frames++;total+=(version===3?1152:576)/rate;
    }
    if (!frames) fail(400,'无法读取音频。');
    duration=total;format='mp3';
  }
  if (!Number.isFinite(duration) || duration<.05 || duration>120) fail(400,'每段音频需要在 0.05–120 秒之间。');
  return {duration,format};
}

function pcmWave(pcm) {
  if (pcm.length%2) fail(502,'语音服务返回了不完整的音频。');
  const header=Buffer.alloc(44);
  header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);
  header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
const xml = value => value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));
export function recipeFor(config, provider, voice, lesson) {
  if (!['elevenlabs','azure'].includes(provider) || !voices.includes(voice)) fail(400,'无效的语音服务。');
  const settings=config[provider];
  if (!settings.apiKey || !settings[voice]) fail(422,`请先配置 ${provider==='azure'?'Azure':'ElevenLabs'} 的密钥与${voice==='female'?'女声':'男声'}。`);
  return {provider,text:lesson.audioText,voiceId:settings[voice],...(provider==='azure'?{region:settings.region}:{modelId:settings.modelId}),version:1};
}
async function limitedBytes(response, maximum) {
  if (Number(response.headers.get('content-length'))>maximum) {await response.body?.cancel();fail(502,'语音服务返回的音频过大。');}
  let total=0;const chunks=[];
  for await (const chunk of response.body || []) {total+=chunk.length;if(total>maximum) fail(502,'语音服务返回的音频过大。');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function alignedWords(alignment, text, duration) {
  if (!alignment || !Array.isArray(alignment.characters) || alignment.characters.length>10000) return null;
  const {characters,character_start_times_seconds:starts,character_end_times_seconds:ends}=alignment;
  if (!Array.isArray(starts) || !Array.isArray(ends) || starts.length!==characters.length || ends.length!==characters.length || characters.some(c=>typeof c!=='string'||c.length!==1)) return null;
  const joined=characters.join('');
  if (joined.trim()!==text.trim()) return null;
  let last=0;const words=[];
  for (const match of joined.matchAll(/\S+/g)) {
    const start=starts[match.index],end=ends[match.index+match[0].length-1];
    if (!Number.isFinite(start)||!Number.isFinite(end)||start<last||end<=start||end>duration+.05) return null;
    words.push({text:match[0],start,end:Math.min(end,duration)});last=end;
  }
  return words;
}

export function audioEntry(asset, lesson) {
  const duration=asset.duration;
  let words=asset.words;
  if (!words || words.length!==lesson.words.length) {
    const total=lesson.words.reduce((sum,w)=>sum+Math.max(1,w.text.length),0);let at=0;
    words=lesson.words.map(word=>{const start=at;at+=duration*Math.max(1,word.text.length)/total;return {text:word.text,start,end:at};});
  }
  // shortcut: phoneme positions within each word are illustrative until reviewed forced alignment is available.
  const clips=words.flatMap((word,wordIndex)=>{
    const sequence=lesson.words[wordIndex].sequence,total=sequence.reduce((sum,id)=>sum+PHONEMES[id].duration,0);let at=word.start;
    return sequence.map(id=>{const start=at;at+=(word.end-word.start)*PHONEMES[id].duration/total;return {id,wordIndex,start,end:at};});
  });
  return {duration,words,clips,engine:asset.provider,timingSource:asset.words?'word-aligned':'estimated',phonemeTiming:'illustrative'};
}

export function createSpeech(store, fetchImpl) {
  const inFlight=new Map();
  async function save(bytes, metadata) {
    const {duration,format}=inspectAudio(bytes);
    const id=digest({bytes:digest(bytes),text:metadata.textHash,recipe:metadata.recipe});
    const asset={...metadata,id,duration,format,size:bytes.length};
    const filename=join(store.directory,'media',`${id}.${format}`),temporary=filename+'.'+randomBytes(6).toString('hex')+'.tmp';
    await store.update(async state=>{
      if (Object.values(state.assets).reduce((size,a)=>size+a.size,0)+(state.assets[id]?0:bytes.length)>1024*1024*1024) fail(413,'音频存储已达到 1 GB，请联系管理员整理音频。');
      await writeFile(temporary,bytes,{mode:0o600});await rename(temporary,filename);state.assets[id]=asset;
    });
    return asset;
  }
  return {
    upload:(bytes,lesson)=>save(bytes,{textHash:digest(lesson.audioText),provider:'upload'}),
    read:asset=>readFile(join(store.directory,'media',`${asset.id}.${asset.format}`)),
    async generate(recipe,{force=false}={}) {
      const cacheKey=digest(recipe);
      const cached=Object.values(store.state.assets).find(asset=>asset.recipe===cacheKey);
      if (cached&&!force) return cached;
      if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
      if (inFlight.size>=2) fail(429,'已有两段语音正在生成，请稍后再试。');
      const operation=(async()=>{
        const settings=store.state.config[recipe.provider];
        if (!settings.apiKey) fail(503,'该语音来源尚未配置，请联系管理员。');
        await store.update(state=>{
          const date=new Date().toISOString().slice(0,10);
          if (state.usage.date!==date) state.usage={date,characters:0};
          if (state.usage.characters+recipe.text.length>state.config.dailyCharacterLimit) fail(429,'今日语音生成额度已用完，请明天重试或调整后台额度。');
          state.usage.characters+=recipe.text.length;
        });
        let bytes,alignment;
        try {
          let response;
          const options={method:'POST',signal:AbortSignal.timeout(90000),redirect:'error'};
          if (recipe.provider==='elevenlabs') {
            response=await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(recipe.voiceId)}/with-timestamps?output_format=pcm_24000`,{...options,headers:{'xi-api-key':settings.apiKey,'Content-Type':'application/json'},body:JSON.stringify({text:recipe.text,model_id:recipe.modelId,voice_settings:{stability:.5,similarity_boost:.75,speed:1}})});
          } else {
            response=await fetchImpl(`https://${recipe.region}.tts.speech.microsoft.com/cognitiveservices/v1`,{...options,headers:{'Ocp-Apim-Subscription-Key':settings.apiKey,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'riff-24khz-16bit-mono-pcm','User-Agent':'PhoneticClassroom'},body:`<speak version="1.0" xml:lang="en-GB"><voice name="${xml(recipe.voiceId)}">${xml(recipe.text)}</voice></speak>`});
          }
          if (!response.ok) {await response.body?.cancel();fail(502,`语音服务返回 ${response.status}，请检查密钥、音色权限和服务额度。`);}
          const body=await limitedBytes(response,recipe.provider==='elevenlabs'?MAX_AUDIO_BYTES*1.5:MAX_AUDIO_BYTES);
          if (recipe.provider==='elevenlabs') {
            const result=JSON.parse(body);
            if (typeof result.audio_base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio_base64)) fail(502,'语音服务未返回有效音频。');
            bytes=pcmWave(Buffer.from(result.audio_base64,'base64'));alignment=result.alignment || result.normalized_alignment;
          } else bytes=body;
        } catch (error) {if(error.status) throw error;fail(502,'语音生成失败或超时，请稍后重试。');}
        const {duration}=inspectAudio(bytes);
        return save(bytes,{provider:recipe.provider,recipe:cacheKey,textHash:digest(recipe.text),words:alignedWords(alignment,recipe.text,duration)});
      })();
      inFlight.set(cacheKey,operation);
      try {return await operation;} finally {inFlight.delete(cacheKey);}
    }
  };
}
