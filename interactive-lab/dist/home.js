import {LESSON_SERIES,LESSONS} from './curriculum.js';
import {SCENES,CHAPTERS,readProgress} from './journey.js';
import {getStudyPlan,readStudyPlan,localDateKey} from './study-plan.js';
const $=id=>document.getElementById(id);
const legacy=new URLSearchParams(location.search).get('lesson');
if(LESSONS[legacy])location.replace('./learn.html?course='+LESSONS[legacy].seriesId);
const progress=readProgress(),plan=getStudyPlan(progress),study=readStudyPlan();
const current=LESSON_SERIES.find(s=>progress[s.id]&&progress[s.id].done.length<7);
const todaySeries=LESSON_SERIES.find(s=>s.id===(current?.id||plan.newCourseId||plan.reviewCourseIds[0]))||LESSON_SERIES[0];
const word=LESSONS[todaySeries.lessonIds[1]],sentence=LESSONS[todaySeries.lessonIds[3]];
$('continue').href='./learn.html?course='+todaySeries.id+(plan.allComplete?'#step-5':'');
$('continue').textContent=current?'继续：'+CHAPTERS[progress[current.id].step]+' →':plan.allComplete?'开始今天的复习 →':'开始今天的小课 →';
$('preview-word').innerHTML=`<small>/${todaySeries.soundIpa}/</small>${word.text}<span aria-hidden="true">${SCENES[todaySeries.id].icon}</span>`;
$('preview-sentence').textContent=sentence.text;
$('preview-count').textContent=String(LESSON_SERIES.indexOf(todaySeries)+1).padStart(2,'0')+' / '+LESSON_SERIES.length;
$('today-date').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
$('streak').textContent=plan.streak+' 天';
$('checkin-state').textContent=plan.checkedIn?'今天已完成学习 ✓':'完成一课或一次整句复习，即可打卡';
$('overall').textContent=plan.completedCount+' / '+plan.totalCourses+' 课已完成';
const daily=$('daily-tasks');
const task=(series,label,description,hash='')=>{
 const a=document.createElement('a');a.className='daily-task';a.href='./learn.html?course='+series.id+hash;
 a.innerHTML=`<span class="daily-icon" aria-hidden="true">${SCENES[series.id].icon}</span><div><small>${label}</small><h3>${SCENES[series.id].place}</h3><p>${description}</p></div><span aria-hidden="true">↗</span>`;daily.append(a);
};
if(!plan.allComplete)task(todaySeries,'今天的新知识',sentence.text);
for(const id of plan.reviewCourseIds.slice(0,2))task(LESSON_SERIES.find(s=>s.id===id),'复习一下，更容易记住','听完整句，再自己说一遍。','#step-5');
if(plan.allComplete&&!plan.reviewCourseIds.length)task(todaySeries,'全部基础课已学完','今天自由选择一课，再说得自然一点。','#step-5');
if(!plan.allComplete&&!plan.reviewCourseIds.length){const note=document.createElement('p');note.className='daily-empty';note.textContent='先学会今天的一句话。学过的课程会在之后安排复习。';daily.append(note);}
let filter='all';
function renderCards(){
 const query=$('course-search').value.trim().toLowerCase();
 $('course-grid').replaceChildren();
 for(const [index,series] of LESSON_SERIES.entries()){
  const saved=progress[series.id],count=saved?.done.length||0;
  if(filter==='new'&&count===7||filter==='done'&&count!==7)continue;
  if(query&&!`${series.title} ${SCENES[series.id].place} ${LESSONS[series.lessonIds[3]].text}`.toLowerCase().includes(query))continue;
  const card=document.createElement('a');card.className='course-card';card.href='./learn.html?course='+series.id;
  card.innerHTML=`<div class="card-art art-${series.id}"><span class="card-letter" aria-hidden="true">${series.letter}${series.letter.toLowerCase()}</span><span class="card-object" aria-hidden="true">${SCENES[series.id].icon}</span><small>LESSON ${String(index+1).padStart(2,'0')}</small></div><div class="card-body"><span class="eyebrow">/${series.soundIpa}/ · ${LESSONS[series.lessonIds[1]].text}</span><h3>${SCENES[series.id].place}</h3><p lang="en">${LESSONS[series.lessonIds[3]].text}</p><progress max="7" value="${count}" aria-label="${series.title}学习进度"></progress><div class="card-meta"><span>${count===7?'已完成 · 可以复习':count?`${count} / 7 个任务`:'5–8 分钟 · 7 个任务'}</span><b>${count===7?'再练一次':count?'继续学习':'开始学习'} ↗</b></div></div>`;
  $('course-grid').append(card);
 }
 $('search-empty').hidden=!!$('course-grid').children.length;
}
$('course-search').oninput=renderCards;
for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderCards();};
let month=new Date();month.setDate(1);month.setHours(12,0,0,0);
function calendar(){
 $('calendar-month').textContent=month.toLocaleDateString('zh-CN',{year:'numeric',month:'long'});
 const grid=$('calendar-days');grid.replaceChildren();
 const offset=(month.getDay()+6)%7;
 for(let i=0;i<offset;i++)grid.append(document.createElement('span'));
 const last=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 for(let day=1;day<=last;day++){
  const date=new Date(month.getFullYear(),month.getMonth(),day,12),key=localDateKey(date),done=study.days[key]?.length>0;
  const el=document.createElement('span');el.className='calendar-day';el.textContent=day;
  if(done)el.dataset.done='true';if(key===plan.date)el.setAttribute('aria-current','date');
  el.setAttribute('aria-label',key+(done?' 已学习':' 未记录学习'));el.title=el.getAttribute('aria-label');grid.append(el);
 }
}
$('calendar-prev').onclick=()=>{month.setMonth(month.getMonth()-1);calendar();};
$('calendar-next').onclick=()=>{month.setMonth(month.getMonth()+1);calendar();};
renderCards();calendar();
