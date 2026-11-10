import {PHONEMES,LETTERS} from './phonemes.js';
const $=id=>document.getElementById(id);
const stages=[['sound','字母音'],['word','单词'],['phrase','短语'],['sentence','句子']];
let session,state,courseId,record,draft,stage=0,voice='female',dirty=false,busy=false;
const tell=(message,error=false)=>{$('status').textContent=message;$('status').dataset.error=String(error);};
async function api(path,{method='GET',data,bytes,headers={}}={}) {
  const response=await fetch('/api/admin/'+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(session?{'X-CSRF-Token':session.csrf}:{}),...headers},body:bytes|| (data?JSON.stringify(data):undefined)});
  const result=await response.json();
  if(!response.ok) {
    if(response.status===401&&path!=='login'){session=null;showSession();}
    throw new Error(result.error||'操作未完成，请重试。');
  }
  return result;
}
async function run(task) {
  if(busy)return;
  busy=true;document.body.classList.add('busy');$('workspace').setAttribute('aria-busy','true');
  for(const id of ['workspace','login-panel','password-panel'])$(id).inert=true;
  try {await task();} catch(error){tell(error.message,true);}
  finally {busy=false;document.body.classList.remove('busy');$('workspace').removeAttribute('aria-busy');for(const id of ['workspace','login-panel','password-panel'])$(id).inert=false;}
}
function showSession() {
  $('login-panel').hidden=!!session;$('account').hidden=!session;
  $('password-panel').hidden=!session?.mustChangePassword;
  $('workspace').hidden=!session||session.mustChangePassword;
  $('cancel-password').hidden=true;
}
function setOptions(element,entries) {element.replaceChildren(...entries.map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));}
setOptions($('course-letter'),Object.keys(LETTERS).map(letter=>[letter,letter]));
setOptions($('course-sound'),Object.entries(PHONEMES).map(([id,p])=>[id,`/${p.ipa}/ · ${id}`]));
$('phoneme-guide').textContent=Object.entries(PHONEMES).map(([id,p])=>`${id} = /${p.ipa}/`).join('　');
function markDirty(){dirty=true;$('editor-meta').textContent='有未保存的修改 · 保存草稿不会改变学生看到的内容';}
function collect() {
  if(!draft)return;
  draft.title=$('course-title').value;draft.letter=$('course-letter').value;draft.soundId=$('course-sound').value;draft.contrast=$('course-contrast').value;
  draft.scene={place:$('scene-place').value,question:$('scene-question').value,transfer:$('scene-transfer').value,choices:$('scene-choices').value.split('\n').map(s=>s.trim()).filter(Boolean),answer:$('scene-answer').value.trim()};
  const lesson=draft.lessons[stage];
  lesson.text=$('lesson-text').value.trim();lesson.translation=$('lesson-translation').value;lesson.ipa=$('lesson-ipa').value;lesson.hint=$('lesson-hint').value;
  const phonemes=$('lesson-phonemes').value.trim();
  lesson.audioPhonemes=phonemes?phonemes.split('\n').map(line=>line.trim().split(/\s+/).filter(Boolean)):lesson.text.split(/\s+/).map(()=>[]);
  if(lesson.stage==='sound')lesson.audioPhonemes=[[draft.soundId]];
  lesson.audio[voice]={...lesson.audio[voice],source:$('audio-source').value,mode:['elevenlabs','azure'].includes($('audio-source').value)?$('audio-mode').value:'saved'};
}
function renderList() {
  const query=$('course-search').value.trim().toLowerCase();
  $('course-count').textContent=Object.keys(state.courses).length+' 门';
  $('course-list').replaceChildren(...Object.entries(state.courses).filter(([id,item])=>(id+' '+item.draft.title).toLowerCase().includes(query)).map(([id,item])=>{
    const button=document.createElement('button');button.type='button';button.setAttribute('aria-current',String(id===courseId));
    const title=document.createElement('span'),detail=document.createElement('small');title.textContent=item.draft.title;detail.textContent=(item.published?'已发布':'草稿')+' · '+id;button.append(title,detail);
    button.onclick=()=>{if(busy)return;if(id===courseId)return;if(dirty&&!confirm('当前修改尚未保存，确定切换课程吗？'))return;selectCourse(id);};return button;
  }));
}
function selectCourse(id) {
  $('audio-preview').pause();courseId=id;record=state.courses[id];draft=structuredClone(record.draft);dirty=false;stage=0;
  $('course-title').value=draft.title;$('course-letter').value=draft.letter;$('course-sound').value=draft.soundId;$('course-contrast').value=draft.contrast;
  for(const key of ['place','question','transfer','answer'])$('scene-'+key).value=draft.scene[key];$('scene-choices').value=draft.scene.choices.join('\n');
  renderRecord();renderStage();renderList();
}
function renderRecord() {
  $('editor-title').textContent=draft.title;$('publish-state').textContent=record.published?'已发布 · 可编辑草稿':'尚未发布';
  $('editor-meta').textContent=record.publishedAt?'最近发布操作：'+new Date(record.publishedAt).toLocaleString('zh-CN'):'保存草稿后，可试听并发布到课堂。';
  $('student-preview').href='./learn.html?course='+courseId;$('student-preview').hidden=!record.published;$('unpublish').disabled=!record.published;
}
function renderStage() {
  const lesson=draft.lessons[stage];
  $('stage-heading').textContent=stages[stage][1]+' · 学习内容';
  $('stage-tabs').replaceChildren(...stages.map(([id,label],index)=>{const button=document.createElement('button');button.type='button';button.textContent=`0${index+1} ${label}`;button.setAttribute('aria-pressed',String(index===stage));button.onclick=()=>{if(busy)return;collect();stage=index;renderStage();};return button;}));
  for(const key of ['text','translation','ipa','hint'])$('lesson-'+key).value=lesson[key];
  $('lesson-phonemes').value=lesson.audioPhonemes.map(row=>row.join(' ')).join('\n');
  renderAudio();
}
function renderAudio() {
  const lesson=draft.lessons[stage],audio=lesson.audio[voice],asset=state.assets[audio.assetId];
  $('audio-voice').value=voice;$('audio-source').value=audio.source;$('audio-mode').value=audio.mode;
  const ai=['elevenlabs','azure'].includes(audio.source);
  $('audio-mode-label').hidden=!ai;$('generate-audio').disabled=!ai||stage===0;
  const player=$('audio-preview');player.pause();player.removeAttribute('src');player.load();
  if(audio.source==='builtin'){
    player.src=`./assets/audio/${voice}/lesson-${audio.builtinId||lesson.id}.wav`;
    $('audio-state').textContent='内置音频只适用于原始内容。修改文字或音素后，需要重新配音。';
  }else if(audio.mode==='dynamic')$('audio-state').textContent='发布后，学生首次点击播放时生成；相同内容与音色复用缓存。此处可先生成试听，再选择是否使用动态方式。';
  else if(asset){player.src=`/api/media/${asset.id}.${asset.format}`;$('audio-state').textContent=`已保存 · ${asset.duration.toFixed(2)} 秒 · ${asset.provider}。请试听并确认与当前文字一致。`;}
  else $('audio-state').textContent='尚未配音。上传录音或配置语音服务后生成；发布时会检查男女声是否齐全。';
  player.hidden=!player.getAttribute('src');
}
async function refresh(preserve=false) {
  state=await api('state');
  if(!courseId||!state.courses[courseId])courseId=Object.keys(state.courses)[0];
  if(preserve){record=state.courses[courseId];draft=structuredClone(record.draft);dirty=false;renderRecord();renderStage();renderList();}
  else selectCourse(courseId);
  renderConfig();
}
async function save() {
  collect();
  if(!$('course-form').reportValidity())throw new Error('请补齐课程内容。');
  record=await api('courses/'+courseId,{method:'PUT',data:{revision:record.revision,course:draft}});
  draft=structuredClone(record.draft);state.courses[courseId]=record;dirty=false;renderRecord();renderList();
}
$('login-form').onsubmit=event=>{event.preventDefault();run(async()=>{
  session=await api('login',{method:'POST',data:{username:$('username').value,password:$('login-password').value}});$('login-password').value='';tell('登录成功。');showSession();if(!session.mustChangePassword)await refresh();
});};
$('logout').onclick=()=>run(async()=>{await api('logout',{method:'POST',data:{}});session=null;dirty=false;showSession();$('audio-preview').pause();tell('已退出登录。');});
$('password-form').onsubmit=event=>{event.preventDefault();run(async()=>{
  if($('new-password').value!==$('confirm-password').value)throw new Error('两次输入的新密码不一致。');
  await api('password',{method:'POST',data:{currentPassword:$('current-password').value,password:$('new-password').value}});$('password-form').reset();session=null;showSession();tell('密码已更新，请使用新密码登录。');
});};
$('change-password').onclick=()=>{$('workspace').hidden=true;$('password-panel').hidden=false;$('cancel-password').hidden=false;$('password-note').textContent='修改密码后，所有已登录会话会退出。';};
$('cancel-password').onclick=()=>showSession();
$('course-form').addEventListener('input',event=>{if(event.target.id==='audio-voice'||event.target.id==='upload-audio')return;if(event.target.id==='lesson-text'){$('lesson-phonemes').value=stage===0?draft.soundId:'';$('lesson-ipa').value='';}markDirty();});
$('course-form').onsubmit=event=>{event.preventDefault();run(async()=>{await save();tell('草稿已保存，学生仍看到已发布的版本。');});};
$('audio-voice').onchange=()=>{const next=$('audio-voice').value;collect();voice=next;renderAudio();};
$('audio-source').onchange=()=>{collect();markDirty();renderAudio();};
$('audio-mode').onchange=()=>{collect();markDirty();renderAudio();};
$('course-sound').onchange=()=>{draft.soundId=$('course-sound').value;draft.lessons[0].audioPhonemes=[[draft.soundId]];if(stage===0)$('lesson-phonemes').value=draft.soundId;};
$('publish').onclick=()=>run(async()=>{await save();tell('正在检查课程与语音…');await api('courses/'+courseId+'/publish',{method:'POST',data:{revision:record.revision}});await refresh(true);tell('课程已发布。学生刷新课堂后即可看到新内容和对应语音。');});
$('unpublish').onclick=()=>{if(!confirm('下架后，学生将无法进入这门课程；草稿和语音会保留。确定下架吗？'))return;run(async()=>{await api('courses/'+courseId+'/unpublish',{method:'POST',data:{revision:record.revision}});await refresh(true);tell('课程已下架，草稿和音频已保留。');});};
$('generate-audio').onclick=()=>run(async()=>{
  await save();tell('正在生成语音，通常需要十几秒…');
  await api('courses/'+courseId+'/generate',{method:'POST',data:{revision:record.revision,stage:stages[stage][0],voice,provider:draft.lessons[stage].audio[voice].source}});
  await refresh(true);tell('语音已生成并保存。请试听，确认后再发布课程。');
});
$('upload-audio').onchange=()=>run(async()=>{
  const file=$('upload-audio').files[0];if(!file)return;
  if(file.size>20*1024*1024)throw new Error('音频不能超过 20 MB。');
  await save();tell('正在上传并检查音频…');
  await api(`courses/${courseId}/upload?stage=${stages[stage][0]}&voice=${voice}`,{method:'POST',bytes:file,headers:{'Content-Type':'application/octet-stream','X-Course-Revision':String(record.revision)}});
  $('upload-audio').value='';await refresh(true);tell('录音已上传。请试听并确认文字一致，再发布课程。');
});
$('new-course-form').onsubmit=event=>{event.preventDefault();run(async()=>{
  if(dirty)await save();const result=await api('courses',{method:'POST',data:{id:$('new-course-id').value.trim(),templateId:courseId}});courseId=result.id;$('new-course-id').value='';await refresh();tell('新课程草稿已创建。请修改情境、四个阶段内容，并为男女声配音。');
});};
$('course-search').oninput=renderList;
function tab(settings){$('courses-panel').hidden=settings;$('settings-panel').hidden=!settings;$('tab-courses').setAttribute('aria-pressed',String(!settings));$('tab-settings').setAttribute('aria-pressed',String(settings));$('audio-preview').pause();}
$('tab-courses').onclick=()=>tab(false);$('tab-settings').onclick=()=>tab(true);
function renderConfig() {
  const config=state.config;
  for(const [provider,prefix] of [['elevenlabs','eleven'],['azure','azure']]){
    const value=config[provider];$(prefix+'-status').textContent=value.configured?'密钥已配置（不会回传到浏览器）':'尚未配置密钥';$(prefix+'-key').value='';$(prefix+'-clear').checked=false;
    for(const voice of ['female','male'])$(prefix+'-'+voice).value=value[voice];
  }
  $('eleven-model').value=config.elevenlabs.modelId;$('azure-region').value=config.azure.region;$('daily-limit').value=config.dailyCharacterLimit;
  const used=state.usage.date===new Date().toISOString().slice(0,10)?state.usage.characters:0;
  $('usage').textContent=`今日已请求 ${used.toLocaleString()} / ${config.dailyCharacterLimit.toLocaleString()} 字符。`;
}
$('settings-form').onsubmit=event=>{event.preventDefault();run(async()=>{
  const config={revision:state.config.revision,dailyCharacterLimit:Number($('daily-limit').value)};
  for(const [provider,prefix] of [['elevenlabs','eleven'],['azure','azure']])config[provider]={apiKey:$(prefix+'-key').value.trim(),clearKey:$(prefix+'-clear').checked,female:$(prefix+'-female').value.trim(),male:$(prefix+'-male').value.trim()};
  config.elevenlabs.modelId=$('eleven-model').value.trim();config.azure.region=$('azure-region').value.trim();state.config=await api('config',{method:'PUT',data:config});renderConfig();tell('语音配置已保存。预生成音频保持原样；动态音色变更需重新发布对应课程。');
});};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
await run(async()=>{try{session=await api('session');}catch(error){if(!error.message.includes('登录'))tell(error.message,true);}showSession();if(session&&!session.mustChangePassword)await refresh();});
