export const VOICES=[['female','女声 · 英式'],['male','男声 · 英式']];
export const audioCatalog=fetch('./assets/audio/manifest.json').then(r=>{if(!r.ok)throw new Error('Missing audio manifest');return r.json();});

export class PronunciationAudio {
  constructor(onEnd,onError){this.onEnd=onEnd;this.onError=onError;this.audio=new Audio();this.key='';this.rate=1;this.muted=false;}
  select(sound,voice,force=false){
    const key=voice+'/'+sound.replace(':','-');if(key===this.key&&!force)return;
    this.audio.pause();this.controller?.abort();if(this.objectURL)URL.revokeObjectURL(this.objectURL);
    this.key=key;this.sound=sound;this.voice=voice;this.loadError=null;
    this.source=new URL('./assets/audio/'+key+'.wav',import.meta.url).href;
    const audio=new Audio();this.audio=audio;
    audio.preload='auto';audio.muted=this.muted;audio.preservesPitch=true;audio.playbackRate=this.rate;
    audio.onended=()=>{if(this.audio===audio)this.onEnd();};
    audio.onerror=()=>{if(this.audio===audio){this.loadError=new Error('音频加载失败，请重试。');this.onError(this.loadError);}};
    const controller=this.controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    // A Blob remains seekable even on local static servers without HTTP Range.
    this.loading=fetch(this.source,{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('音频加载失败，请重试。');return r.blob();}).then(blob=>{
      if(this.audio!==audio)return;
      this.objectURL=URL.createObjectURL(blob);audio.src=this.objectURL;audio.load();
    }).catch(error=>{if(this.audio===audio){this.loadError=new Error('音频加载失败，请重试。');this.onError(this.loadError);}}).finally(()=>clearTimeout(timeout));
  }
  async play(progress){
    if(this.loadError)this.select(this.sound,this.voice,true);
    const audio=this.audio;const ticket=this.ticket=(this.ticket||0)+1;
    await this.loading;
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
    this.rate=Math.max(.2,Math.min(3,rate));this.audio.playbackRate=this.rate;
  }
  setMuted(muted){this.muted=muted;this.audio.muted=muted;}
}
