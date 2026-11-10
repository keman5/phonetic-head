import {t, htmlT, locale} from './i18n.js';
import {LESSON_SERIES,LESSONS,DEMONSTRATION_RATE} from './curriculum.js';
import {CHAPTERS,SCENES,readProgress,writeProgress,lessonForChapter} from './journey.js';
import {recordCompletion,localDateKey} from './study-plan.js';
import {mountVoicePractice} from './voice-practice.js';
import {PronunciationAudio,audioCatalog,curriculumCatalog} from './audio.js';
import {escapeHTML} from './html.js';
const $=id=>document.getElementById(id);
const series=LESSON_SERIES.find(s=>s.id===new URLSearchParams(location.search).get('course'))||LESSON_SERIES[0];
const scene=SCENES[series.id],progress=readProgress();
const saved=progress[series.id]||{step:0,done:[]};progress[series.id]=saved;
let step=0,lesson,frameLoaded=false,textMode=false,eligible=false,catalog,activeWord=-1,demoRate=null;
const frame=$('model-frame');
let voicePractice;
const audio=new PronunciationAudio(completePlayback,error=>{$('feedback').textContent=t('声音暂时没有播完。请点示范按钮重试。');eligible=false;});
audioCatalog.catch(()=>{});curriculumCatalog.then(value=>catalog=value).catch(()=>{});
function model(){
 try{return frameLoaded?frame.contentWindow.teachingPlayer:null;}
 catch{return null;} // A failed iframe navigation can become a browser-owned error page.
}
const currentRate=()=>demoRate??(step===1?.65:DEMONSTRATION_RATE);
function updateRateControls(){
 const rate=currentRate();
 $('demo-rate').value=String(rate);$('demo-rate-value').value=rate+'×';
 $('demo-rate').setAttribute('aria-valuetext',rate+t(' 倍'));
 document.querySelectorAll('[data-demo-rate]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.demoRate)===rate)));
 $('demo').textContent=step===1&&!textMode?t('▶ 看口型跟读 · ')+rate+'×':step===6?t('需要帮助：听示范 / 看句子'):textMode?t('▶ 听声音，按提示模仿'):t('▶ 听老师示范');
}
const usesModel=()=>step<7&&!textMode;
const unlocked=()=>{let i=0;while(saved.done.includes(i))i++;return i;};
function persist(){saved.step=step;$('storage-warning').hidden=writeProgress(progress);}
function stopMedia(){audio.pause();model()?.pause();$('pause').disabled=true;}
function stop(){stopMedia();voicePractice?.stop();}
function completePlayback(){
 $('scrub').value=1000;
 if(!eligible)return;eligible=false;
 if(step===5||step===6){saved.sentenceHeardOn=localDateKey();persist();}
 if([0,1,2,4,5].includes(step))complete();
 else if(step===3){$('answers').hidden=false;$('feedback').textContent=t('听完啦！这句话表达了哪个意思？');}
 else if(step===6&&selfChecked())complete();
 else $('feedback').textContent=t('现在轮到你了，先自己说，再打开句子核对。');
}
const selfChecked=()=>saved.selfCheck?.date===localDateKey()&&[...$('reflection').querySelectorAll('input')].every(el=>el.checked);
function updateReflection(){
 const count=[...$('reflection').querySelectorAll('input:checked')].length;
 const reviewed=saved.done.includes(6);
 $('reflection-progress').textContent=count===2?t('2 / 2 · 自查完成'):`${count} / 2 · ${count===0?t('先自己说一句，再勾选下面两项'):t('再确认剩下的一项')}`;
 $('next').disabled=!reviewed;
 $('next').textContent=reviewed?t('查看学习回顾 →'):t("完成两项自查后回顾 · {0}/2", count);
 $('task-badge').textContent=reviewed?t('已完成 · 可回顾'):t("自查 {0} / 2", count);
 $('reflection-help').textContent=count===2?t('自查已保存，点击下方按钮查看学习回顾。想继续练习，也可以录音对比。'):reviewed?t('本课已完成，可直接查看回顾。今天重新练习时，再按实际情况勾选。'):t('不用评分，也不必开启麦克风。自己说过、对照过示范，就可以勾选。');
}
function complete(){
 if(!saved.done.includes(step)&&step<7)saved.done.push(step);
 persist();
 if(step===6&&saved.done.length===7&&saved.sentenceHeardOn===localDateKey()){const result=recordCompletion(series.id);if(!result.saved)$('storage-warning').hidden=false;}
 $('next').disabled=false;$('next').textContent=step===6?t('看看我的学习回顾 →'):t('继续：')+CHAPTERS[step+1]+' →';
 $('feedback').textContent=step===3?t('对了，你听懂了！接下来把词连起来。'):t('这个任务完成了。想再练一遍也可以。');
 if(step===6){updateReflection();$('feedback').textContent=saved.sentenceHeardOn===localDateKey()?t('自查完成！可以回顾今天的学习了。'):t('自查完成，可以进入回顾；今天再完整听一次示范，即可记录今日学习。');}
 renderChapters();
}
function renderChapters(){
 $('chapters').replaceChildren(...CHAPTERS.map((name,i)=>{
  const button=document.createElement('button');button.type='button';button.disabled=i>unlocked();
  button.textContent=`${saved.done.includes(i)?'✓':String(i+1).padStart(2,'0')}  ${name}`;
  if(i===step)button.setAttribute('aria-current','step');button.onclick=()=>go(i);return button;
 }));
}
function go(index){location.hash='step-'+index;}
function setWords(index){
 if(index===activeWord)return;activeWord=index;
 [...$('reading-text').children].forEach((el,i)=>el.toggleAttribute('data-active',index===i));
}
function updateMode(){
 $('learning-modes').hidden=step===7;
 $('model-mode').setAttribute('aria-pressed',String(!textMode));
 $('text-mode').setAttribute('aria-pressed',String(textMode));
 $('model-panel').hidden=!usesModel();
 $('scene').hidden=!textMode&&![0,3,6,7].includes(step);
 if(usesModel()){
  if(!frame.getAttribute('src'))frame.src='./lab.html?embed=1&lesson='+lesson.id+'&ui-lang='+locale;
  else model()?.select(lesson.id);
 }else audio.select('lesson:'+lesson.id,'female');
 $('demo').disabled=usesModel()&&!model()?.ready;
 updateRateControls();
}
function switchMode(useText){
 if(textMode===useText)return;
 stop();eligible=false;textMode=useText;
 $('scrub').value=0;setWords(-1);updateMode();
 $('feedback').textContent=t('已切换到')+(textMode?t('图文与声音'):t('3D 模型'))+t('，点示范按钮开始。');
}
function render(){
 stop();eligible=false;activeWord=-1;
 const match=location.hash.match(/^#step-(\d)$/);step=Math.min(match?Number(match[1]):saved.step,unlocked(),7);
 history.replaceState(null,'','#step-'+step);persist();lesson=LESSONS[lessonForChapter(series,step)];
 document.title=CHAPTERS[step]+' · '+series.title;$('lesson-name').textContent=scene.place;
 $('step-label').textContent=`${t('课次')} ${String(LESSON_SERIES.indexOf(series)+1).padStart(2,'0')} / ${step===7?t('学习回顾'):t("任务 {0} · 共 7 个", step+1)}`;
 const titles=[scene.place,t('这个声音，嘴巴怎么动？'),t('现在，把它读成一个词'),t('你听懂它了吗？'),t('加一点描述，说得更具体'),t('连起来，说完整的一句话'),t('把这句话说给一个人听'),t('你已经走完了这段学习旅程')];
 const instructions=[scene.question,t('听声音、看慢动作，再轻轻模仿。声音和口型一起放慢。'),t('先听一个完整单词，再跟着说，不要在辅音后面加“呃”。'),t('先听完整一句，再选出你听到的意思。答错了也可以重新听。'),t('把两个词当作一个意思组，连贯说出来。'),t('先完整听，再跟读。轻读小词，突出你想表达的意思。'),t('先不看文字，自己说一遍；需要帮助时可以打开提示。'),t('今天的完成记录代表你参与了练习，读得准不准，请老师帮忙听一听。')];
 $('screen-title').textContent=titles[step];$('instruction').textContent=instructions[step];
 $('scene-icon').innerHTML=scene.icon;
 $('scene-copy').textContent=step===3?t('听一听，选一选'):step===6?t('轮到你来表达了'):scene.place;
 $('reading').hidden=[3,6].includes(step);$('reading-text').replaceChildren(...lesson.text.split(' ').map(word=>{const el=document.createElement('span');el.textContent=word;return el;}));
 $('reading-meaning').textContent=lesson.translation;
 $('teacher-tip').hidden=step===3;
 $('teacher-tip').textContent=step===0?t('今天的小目标：听懂这句话，读清重点单词，再自己说一遍。'):step===1?series.contrast+' '+lesson.hint:step===6?scene.transfer:lesson.hint;
 $('media-controls').hidden=step===7;updateRateControls();
 $('demo').disabled=usesModel()&&!model()?.ready;$('scrub').value=0;$('scrub').disabled=step===3;
 $('answers').hidden=true;$('answers').replaceChildren(...scene.choices.map(answer=>{
  const button=document.createElement('button');button.type='button';button.textContent=answer;
  button.onclick=()=>{if(answer===scene.answer){button.dataset.correct='true';complete();}else{$('feedback').textContent=t('再听一次，留意句子里介绍的是什么。你可以换一个答案。');button.dataset.wrong='true';}};return button;
 }));
 $('voice-practice').hidden=![2,4,5,6].includes(step);$('voice-coach-link').hidden=step!==6;$('voice-coach-link').firstElementChild.href='./practice.html?course='+series.id;
 $('reflection').hidden=step!==6;$('reflection').querySelectorAll('input').forEach((input,i)=>input.checked=saved.selfCheck?.date===localDateKey()&&saved.selfCheck.checks[i]);
 $('review').hidden=step!==7;
 if(step===7){$('review').innerHTML=htmlT('<h2>带走今天的三个收获</h2><ul><li>听懂一句话的意思</li><li>从字母音读到单词、短语和句子</li><li>自己试着表达，并对照示范</li></ul><p>')+escapeHTML(scene.transfer)+htmlT('</p><button type="button" id="review-again">再练完整句 →</button>');$('review-again').onclick=()=>go(5);}
 $('previous').disabled=step===0;$('next').hidden=step===7;$('finish').hidden=step!==7;
 const navigation=[$('feedback'),$('storage-warning'),document.querySelector('.lesson-navigation')];
 if(step===6)$('reflection').after(...navigation);else document.querySelector('.lesson-screen').append(...navigation);
 $('next').disabled=step===6||!saved.done.includes(step);$('next').textContent=step===6?t('完成自查后回顾'):saved.done.includes(step)?t('下一步 →'):t('完成当前任务后继续');
 $('feedback').textContent=step===7?t('7 / 7 个学习任务已完成'):saved.done.includes(step)?t('这个任务已经完成，可以复习或继续。'):t('准备好后，开始这一个小任务。');
 $('task-badge').textContent=step===7?t('课程已完成'):saved.done.includes(step)?t('已完成 · 可复习'):t('一个小任务');
 if(step===6)updateReflection();
 updateMode();
 renderChapters();document.body.dataset.chapter=String(step);$('screen-title').focus({preventScroll:true});scrollTo({top:0,behavior:'instant'});
}
frame.addEventListener('load',()=>{
 frameLoaded=true;model()?.select(lesson.id);
 // Module initialization can finish after iframe load when the published catalog is fetched.
 try{
  frame.contentWindow.addEventListener('teaching-ready',()=>model()?.select(lesson.id));
  frame.contentWindow.addEventListener('teaching-ended',event=>{if(usesModel()&&event.detail.sound==='lesson:'+lesson.id)completePlayback();});
  frame.contentWindow.addEventListener('teaching-error',()=>{if(usesModel()){eligible=false;$('feedback').textContent=t('示范暂时无法播放。可以重试，或改用图文与声音学习。');}});
 }catch{/* A failed iframe navigation can point at a browser-owned error page. */}
});
$('demo').onclick=async()=>{
 stop();eligible=true;
 if(step===6)$('reading').hidden=false;
 $('feedback').textContent=step===1&&!textMode?t('观察舌头、嘴唇与气息的配合。'):t('先认真听，示范结束后再跟读。');
 if(usesModel())await model()?.play(step===1,currentRate());
 else {audio.select('lesson:'+lesson.id,'female');audio.setRate(currentRate());await audio.play(0).catch(()=>{eligible=false;$('feedback').textContent=t('示范没有播完，请再试一次。');});}
};
$('pause').onclick=()=>{stop();$('feedback').textContent=t('已暂停。点示范按钮可从头再来。');};
$('scrub').oninput=()=>{eligible=false;const value=Number($('scrub').value)/1000;if(usesModel())model()?.seek(value);else{audio.pause();audio.seek(value);} $('feedback').textContent=t('正在回看。完成任务请再完整播放一遍。');};
$('text-mode').onclick=()=>switchMode(true);
$('model-mode').onclick=()=>switchMode(false);
$('review-listen').onclick=()=>$('demo').click();
$('demo-rate').oninput=()=>{
 demoRate=Number($('demo-rate').value);audio.setRate(demoRate);model()?.setRate(demoRate);updateRateControls();
};
document.querySelectorAll('[data-demo-rate]').forEach(button=>button.onclick=()=>{
 $('demo-rate').value=button.dataset.demoRate;$('demo-rate').dispatchEvent(new Event('input'));
});
$('previous').onclick=()=>go(step-1);$('next').onclick=()=>{if(saved.done.includes(step))go(step+1);};
$('reflection').onchange=()=>{
 saved.selfCheck={date:localDateKey(),checks:[...$('reflection').querySelectorAll('input')].map(input=>input.checked)};
 persist();if(selfChecked())complete();else{updateReflection();$('feedback').textContent=saved.done.includes(6)?t('已完成的课程仍可查看回顾；本次自查按实际情况填写。'):$('reflection-progress').textContent;}
};
window.addEventListener('hashchange',render);
window.addEventListener('pagehide',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
function update(){
 if(usesModel()){$('demo').disabled=!model()?.ready;}
 $('review-listen').disabled=$('demo').disabled;
 const status=usesModel()?model()?.status:{playing:!audio.audio.paused,progress:audio.progress};
 $('pause').disabled=!status?.playing;
 if(status?.playing)$('scrub').value=Math.round(status.progress*1000);
 let word=-1;
 if(status?.playing){
  if(usesModel())word=status.wordIndex;
  else {const entry=catalog?.voices.female.entries['lesson-'+lesson.id];const time=audio.audio.currentTime;word=entry?.words.findIndex(w=>time>=w.start&&time<w.end)??-1;}
 }
 setWords(word);requestAnimationFrame(update);
}
voicePractice=mountVoicePractice($('voice-practice'),{getLesson:()=>lesson,onBeforeAudio:()=>{stopMedia();eligible=false;}});
$('text-mode').disabled=false;$('model-mode').disabled=false;
render();requestAnimationFrame(update);
