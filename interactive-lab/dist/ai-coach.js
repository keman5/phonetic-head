import {t, htmlT, locale} from './i18n.js';
export function mountAICoach(container,{getLesson,getRecording,startRecording,stopRecording}){
 container.innerHTML=htmlT`<h2>和老师聊一聊</h2><span class="coach-state">正在检查连接…</span><p>先练一句，再用它聊天。在线教练根据识别文字给建议，不能判断真实舌位或发音标准度。</p><label><input type="checkbox" data-consent>同意将我主动发送的录音或文字交给已配置的 AI 服务处理</label><textarea aria-label="想对老师说的话" placeholder="也可以打字：I like dogs."></textarea><button data-send-text disabled>发送文字</button><button data-send-audio disabled>发送这次录音，获得建议</button><button data-talk disabled>开始连续语音交流</button><button data-stop hidden>结束语音交流</button><label><input type="checkbox" data-speak checked>朗读回复（系统语音）</label><div class="coach-chat" role="status" aria-live="polite"><p>录音对比无需联网。在线教练仅在你主动开启后使用。</p></div>`;
 const $=selector=>container.querySelector(selector),status=$('.coach-state'),output=$('.coach-chat');
 let configured=false,continuous=false,busy=false,serial=0,controller,disposed=false;
 const consent=()=> $('[data-consent]').checked;
 function buttons(){
  $('[data-send-text]').disabled=!configured||!consent()||busy;
  $('[data-send-audio]').disabled=!configured||!consent()||busy||!getRecording()||getLesson().stage==='sound';
  $('[data-talk]').disabled=!configured||!consent()||busy||continuous;
  $('[data-stop]').hidden=!continuous&&!busy;
 }
 const history=[];
 function stop(){serial++;controller?.abort();continuous=false;busy=false;window.speechSynthesis?.cancel();stopRecording();buttons();status.textContent=configured?t('在线教练已配置'):t('在线教练未连接');}
 const tell=text=>{output.replaceChildren();const p=document.createElement('p');p.textContent=text;output.append(p);};
 function speak(text,ticket){
  return new Promise(resolve=>{
   if(!$('[data-speak]').checked||!window.speechSynthesis||serial!==ticket)return resolve();
   window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=locale==='en'?'en-GB':'zh-CN';utterance.rate=.9;utterance.onend=resolve;utterance.onerror=resolve;window.speechSynthesis.speak(utterance);
  });
 }
 async function submit({blob,text,mode='practice'}){
  if(!configured||!consent())return;
  controller?.abort();controller=new AbortController();const ticket=++serial,lesson=getLesson();busy=true;buttons();status.textContent=t('老师正在听…');
  try{
   const body={lessonId:lesson.id,mode,history:[...history]};
   if(blob){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});body.audio=data.split(',')[1];body.mime=blob.type.split(';')[0];}else body.text=text;
   if(ticket!==serial)return;
   const response=await fetch('./api/coach',{method:'POST',headers:{'Content-Type':'application/json','Accept-Language':locale},body:JSON.stringify(body),signal:controller.signal});
   const result=await response.json();if(ticket!==serial||disposed)return;if(!response.ok)throw Error(result.error||t('老师暂时没有回应。'));
   output.replaceChildren();
   for(const value of [t("我听到：{0}", result.transcript),result.matchPercent===null?'':t("{0}：{1}%", result.scoreLabel, result.matchPercent),result.reply].filter(Boolean)){const p=document.createElement('p');p.textContent=value;output.append(p);}
   history.push({role:'user',content:result.transcript},{role:'assistant',content:result.reply});history.splice(0,Math.max(0,history.length-6));
   status.textContent=t('轮到你说了');await speak(result.reply,ticket);
   if(ticket!==serial)return;busy=false;buttons();if(continuous&&consent())await startRecording({autoStop:true});
  }catch(error){if(ticket!==serial)return;continuous=false;tell(error.message||t('连接暂时中断，请重试。'));status.textContent=t('可以重试');}
  finally{if(ticket===serial){busy=false;buttons();}}
 }
 $('[data-consent]').onchange=()=>{if(!consent())stop();buttons();};
 $('[data-send-text]').onclick=()=>{const text=$('textarea').value.trim();if(!text)return tell(t('先输入一句想说的话。'));stopRecording();continuous=false;submit({text,mode:'conversation'});};
 $('[data-send-audio]').onclick=()=>{if(getLesson().stage==='sound')return;const blob=getRecording();if(blob){stopRecording();continuous=false;submit({blob});}};
 $('[data-talk]').onclick=async()=>{continuous=true;buttons();status.textContent=t('正在听你说，停顿后会自动发送');tell(t('先说一句英语。每轮最多 15 秒；点击“结束语音交流”可随时停止。'));await startRecording({autoStop:true});};
 $('[data-stop]').onclick=stop;
 const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
 fetch('./api/coach/status').then(r=>r.ok?r.json():{configured:false}).then(value=>{if(disposed)return;configured=value.configured===true;status.textContent=configured?t('在线教练已配置'):t('在线教练未连接');if(!configured)tell(t('当前可使用全部本地课程和录音对比。连接 AI 服务后，这里可以语音交流。'));buttons();}).catch(()=>{status.textContent=t('在线教练未连接');buttons();});
 return {recorded(event){buttons();if(event.type==='error'){stop();tell(t('麦克风暂时不可用，请查看录音提示，也可以输入文字。'));return;}if(continuous&&event.blob){if(event.analysis?.silenceRatio>.85){stop();tell(t('这次没有听到清楚的声音。靠近麦克风后，可以重新开始。'));}else submit({blob:event.blob,mode:'conversation'});}},reset(){stop();history.length=0;tell(configured?t('已切换练习主题。可以录音或和老师聊聊。'):t('在线教练未连接。可以继续本地录音，与示范对比。'));},stop,dispose(){disposed=true;stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);}};
}
