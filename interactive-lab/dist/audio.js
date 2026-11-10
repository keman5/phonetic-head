import {LESSONS,lessonAudioURL} from './curriculum.js';
export const VOICES=[['female','女声 · 英式'],['male','男声 · 英式']];
export const audioCatalog=fetch('./assets/audio/manifest.json').then(r=>{if(!r.ok)throw new Error('Missing audio manifest');return r.json();});
export const curriculumCatalog=fetch('./assets/audio/curriculum-manifest.json').then(r=>{if(!r.ok)throw new Error('Missing lesson audio manifest');return r.json();}).then(catalog=>{
  for(const lesson of Object.values(LESSONS))for(const voice of ['female','male']){
    const audio=lesson.audio?.[voice];
    if(audio?.builtinId)catalog.voices[voice].entries['lesson-'+lesson.id]=catalog.voices[voice].entries['lesson-'+audio.builtinId];
    if(audio&&audio.source!=='builtin'){
      // Replaced speech must never keep the old recording's timing.
      catalog.voices[voice].entries['lesson-'+lesson.id]=audio.entry||{duration:lesson.duration,words:[],clips:[],timingSource:'pending'};
    }
  }
  return catalog;
});

export class PronunciationAudio {
  constructor(onEnd,onError,onMetadata=()=>{}){this.onEnd=onEnd;this.onError=onError;this.onMetadata=onMetadata;this.audio=new Audio();this.key='';this.rate=1;this.muted=false;}
  select(sound,voice,force=false){
    const key=voice+'/'+sound.replace(':','-');if(key===this.key&&!force)return;
    this.audio.pause();this.controller?.abort();if(this.objectURL)URL.revokeObjectURL(this.objectURL);
    this.key=key;this.sound=sound;this.voice=voice;this.loadError=null;
    const lessonId=sound.startsWith('lesson:')?sound.slice(7):null;
    const managed=LESSONS[lessonId]?.audio?.[voice];
    this.source=lessonId?lessonAudioURL(lessonId,voice):new URL('./assets/audio/'+key+'.wav',import.meta.url).href;
    const audio=new Audio();this.audio=audio;
    audio.ondurationchange=()=>{if(this.audio===audio)this.onMetadata();};
    audio.preload='auto';audio.muted=this.muted;audio.preservesPitch=true;audio.defaultPlaybackRate=audio.playbackRate=this.rate;
    audio.onended=()=>{if(this.audio===audio)this.onEnd();};
    audio.onerror=()=>{if(this.audio===audio){this.loadError=new Error('音频加载失败，请重试。');this.onError(this.loadError);}};
    const controller=this.controller=new AbortController();
    this.loading=null;
    this.load=()=>{
    const timeout=setTimeout(()=>controller.abort(),managed?.resolveURL?110000:15000);
    // A Blob remains seekable even on local static servers without HTTP Range.
    this.loading=(async()=>{
      if(managed?.resolveURL){
        const response=await fetch(managed.resolveURL,{signal:controller.signal});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'音频暂不可用。');
        if(this.audio!==audio)return;
        this.source=result.url;
        const catalog=await curriculumCatalog;
        catalog.voices[voice].entries[key.replace(voice+'/','')]=result.entry;
        this.onMetadata();
      }
      const response=await fetch(this.source,{signal:controller.signal});
      if(!response.ok)throw new Error('音频加载失败，请重试。');return response.blob();
    })().then(blob=>{
      if(this.audio!==audio)return;
      this.objectURL=URL.createObjectURL(blob);audio.src=this.objectURL;audio.load();
    }).catch(error=>{if(this.audio===audio){this.loadError=new Error(error.name==='AbortError'?'语音准备超时，请重试。':error.message||'音频加载失败，请重试。');this.onError(this.loadError);}}).finally(()=>clearTimeout(timeout));
    return this.loading;
    };
    // Dynamic generation starts only after an explicit play, never while browsing courses.
    if(managed?.mode!=='dynamic')this.load();
  }
  async play(progress){
    if(this.loadError)this.select(this.sound,this.voice,true);
    const audio=this.audio;const ticket=this.ticket=(this.ticket||0)+1;
    await (this.loading||this.load());
    if(this.audio!==audio||this.ticket!==ticket)return;
    if(this.loadError)throw this.loadError;
    if(audio.readyState<1)await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>finish(new Error('音频加载超时，请重试。')),15000);
      const loaded=()=>finish(),failed=()=>finish(new Error('音频加载失败，请重试。'));
      function finish(error){clearTimeout(timeout);audio.removeEventListener('loadedmetadata',loaded);audio.removeEventListener('error',failed);error?reject(error):resolve();}
      audio.addEventListener('loadedmetadata',loaded);audio.addEventListener('error',failed);
      if(audio.error)failed();
    });
    if(this.audio!==audio||this.ticket!==ticket)return;
    audio.currentTime=Math.min(Math.max(0,progress),.999999)*audio.duration;
    try{await audio.play();}catch(error){if(this.audio===audio&&this.ticket===ticket)throw error;}
  }
  pause(){this.ticket=(this.ticket||0)+1;this.audio.pause();}
  seek(progress){if(this.duration)this.audio.currentTime=Math.max(0,Math.min(1,progress))*this.duration;}
  get progress(){return Number.isFinite(this.audio.duration)&&this.audio.duration>0?this.audio.currentTime/this.audio.duration:0;}
  get duration(){return Number.isFinite(this.audio.duration)?this.audio.duration:0;}
  setRate(rate){
    if(!Number.isFinite(rate))return;
    this.rate=Math.max(.2,Math.min(3,rate));this.audio.defaultPlaybackRate=this.audio.playbackRate=this.rate;
  }
  setMuted(muted){this.muted=muted;this.audio.muted=muted;}
}
