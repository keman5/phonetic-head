import {t, locale} from './i18n.js';
import {LESSON_SERIES,LESSONS,LESSON_STAGES} from './curriculum.js';
import {SCENES} from './journey.js';
import {mountVoicePractice} from './voice-practice.js';
import {mountAICoach} from './ai-coach.js';
import {escapeHTML as html} from './html.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),sing=params.get('mode')==='sing';
let series=LESSON_SERIES.find(s=>s.id===params.get('course'))||LESSON_SERIES[0],stage=3,blob=null,voice,coach,noteContext,coachStarting=false;
const getLesson=()=>sing?{id:'sing-a3',text:t('轻轻哼一个音'),hint:t('放松肩膀，舒适地轻哼，不需要用力。'),stage:'sing',exampleURL:null}:LESSONS[series.lessonIds[stage]];
function stopNote(){noteContext?.close();noteContext=null;}
voice=mountVoicePractice($('practice-recorder'),{getLesson,onBeforeAudio:()=>{stopNote();if(!coachStarting)coach?.stop();window.speechSynthesis?.cancel();},onActivity:event=>{
 if(event.type==='deleted'){blob=null;if(event.reason==='user')coach?.stop();coach?.recorded(event);return;}
 if(event.type==='error'){coach?.recorded(event);return;}
 if(event.type!=='recorded')return;blob=event.blob;coach?.recorded(event);
 if(sing){const hz=event.analysis.pitchHz;if(!hz)$('pitch-result').textContent=t('这次没有检测到稳定的音高。可以在安静环境里轻哼 2–3 秒再试。');else{const cents=Math.round(1200*Math.log2(hz/220));$('pitch-result').textContent=t("检测音高约 {0} Hz。", Math.round(hz))+(Math.abs(cents)<=35?t('已经很接近参考音了，试着保持这个轻松的声音。'):cents>0?t('比参考音高一些。再听一次，试着轻轻往低一点找。'):t('比参考音低一些。再听一次，试着轻轻往高一点找。'));}}
}});
if(!sing){$('practice-recorder').querySelector('.voice-practice>p').textContent=t('录音默认仅在本页处理。主动发送或开启连续语音后，会交给已配置的 AI 服务处理。');document.querySelector('.practice-info').textContent=t('删除或离开页面会清除本地录音，不能撤回已发送给 AI 的数据。不开启在线教练时，全部录音对比都在本地进行。');}
if(!sing)coach=mountAICoach($('ai-coach'),{getLesson,getRecording:()=>blob,startRecording:options=>{coachStarting=true;try{return voice.start(options);}finally{coachStarting=false;}},stopRecording:()=>voice.stop()});
function render(){
 voice.stop();blob=null;coach?.reset();$('pitch-result').textContent='';
 const lesson=getLesson();$('practice-context').innerHTML=`<span aria-hidden="true">${sing?'♫':SCENES[series.id].icon}</span><div><p>${sing?t('声音与节奏入门'):html(SCENES[series.id].place)}</p><h2 lang="${sing?locale:'en-GB'}">${html(lesson.text)}</h2><p>${html(lesson.translation||t('听见自己的声音'))}</p></div>`;
 if(!sing){history.replaceState(null,'',`?course=${series.id}`);$('practice-topics').replaceChildren(...LESSON_SERIES.map(s=>{const b=document.createElement('button');b.textContent=s.title;b.setAttribute('aria-pressed',String(s===series));b.onclick=()=>{series=s;render();};return b;}));$('practice-stages').replaceChildren(...LESSON_STAGES.map((s,i)=>{const b=document.createElement('button');b.textContent=s.label;b.setAttribute('aria-pressed',String(i===stage));b.onclick=()=>{stage=i;render();};return b;}));}
}
if(sing){document.querySelector('.practice-info').textContent=t('先听参考音，再轻哼回听。录音只保存在当前页面，离开即清除。没有麦克风时也可以听音练习。');$('practice-recorder').querySelector('h3').textContent=t('轻轻哼给自己听');$('practice-title').textContent=t('用一个音，认识自己的声音。');$('practice-intro').textContent=t('从轻轻哼唱开始，练习听音和模仿。今天不追求高音，只找到一个舒服、接近参考的声音。');$('practice-topics').hidden=true;$('practice-stages').hidden=true;$('ai-coach').hidden=true;$('sing-guide').hidden=false;$('sing-reference').hidden=false;document.title=t('唱歌小探索 · 发音探索');}
$('play-note').onclick=async()=>{voice.stop();stopNote();const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext){$('pitch-result').textContent=t('此浏览器暂不支持参考音播放。');return;}noteContext=new AudioContext();await noteContext.resume();const oscillator=noteContext.createOscillator(),gain=noteContext.createGain();oscillator.frequency.value=220;gain.gain.setValueAtTime(0,noteContext.currentTime);gain.gain.linearRampToValueAtTime(.12,noteContext.currentTime+.05);gain.gain.setValueAtTime(.12,noteContext.currentTime+1.7);gain.gain.linearRampToValueAtTime(0,noteContext.currentTime+2);oscillator.connect(gain).connect(noteContext.destination);oscillator.start();oscillator.stop(noteContext.currentTime+2);};
window.addEventListener('pagehide',()=>{voice.stop();coach?.stop();blob=null;stopNote();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopNote();});render();
