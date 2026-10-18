import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LESSONS} from './dist/curriculum.js';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wav':'audio/wav','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary'};
export function wordMatch(expected,heard){
 const words=text=>text.toLowerCase().replace(/[^a-z' ]/g,' ').trim().split(/\s+/).filter(Boolean);
 const a=words(expected),b=words(heard);if(!a.length)return null;
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
 return Math.round(100*Math.max(0,1-row[b.length]/Math.max(a.length,b.length)));
}
export function createApp({key=process.env.AI_API_KEY,baseURL=process.env.AI_BASE_URL||'https://api.openai.com/v1',chatModel=process.env.AI_CHAT_MODEL||'gpt-4.1-mini',transcribeModel=process.env.AI_TRANSCRIBE_MODEL||'whisper-1',fetchImpl=fetch}={}){
 const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 let active=0;
 return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(self)');
  const host=req.headers.host;
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host||''))return json(res,403,{error:'仅允许本机访问。'});
  const url=new URL(req.url,'http://'+host);
  if(url.pathname==='/api/coach/status'&&req.method==='GET')return json(res,200,{configured:!!key});
  if(url.pathname==='/api/coach'){
   if(req.method!=='POST')return json(res,405,{error:'仅支持 POST。'});
   if(req.headers.origin!==`http://${host}`)return json(res,403,{error:'请从本机课堂页面发起请求。'});
   if(Number(req.headers['content-length'])>4*1024*1024)return json(res,413,{error:'录音过长，请录制 15 秒以内的片段。'});
   if(!key)return json(res,503,{error:'AI 教练尚未配置，请先使用本地录音对比。'});
   if(active>=2)return json(res,429,{error:'老师正在听，请稍后再试。'});
   active++;
   const cancelled=new AbortController();
   const disconnect=()=>{if(!res.writableEnded)cancelled.abort();};res.on('close',disconnect);
   try{
    if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'请求格式不正确。'});
    let size=0,chunks=[];for await(const part of req){size+=part.length;if(size>4*1024*1024)return json(res,413,{error:'录音过长，请录制 15 秒以内的片段。'});chunks.push(part);}
    let data;try{data=JSON.parse(Buffer.concat(chunks));}catch{return json(res,400,{error:'请求格式不正确。'});}
    if(!data||typeof data!=='object'||!LESSONS[data.lessonId]||!['practice','conversation'].includes(data.mode))return json(res,400,{error:'请先选择一节有效课程。'});
    const lesson=LESSONS[data.lessonId];
    if(data.mode==='practice'&&lesson.stage==='sound')return json(res,422,{error:'单个音素请使用本地回听和老师点评；语音转写不能可靠评判单音。'});
    let transcript='';
    const call=async(path,options)=>{
     cancelled.signal.throwIfAborted();
     const response=await fetchImpl(baseURL.replace(/\/$/,'')+path,{...options,headers:{Authorization:'Bearer '+key,...options.headers},signal:AbortSignal.any([cancelled.signal,AbortSignal.timeout(30000)])});
     if(!response.ok)throw Error('upstream');return response.json();
    };
    if(data.audio){
     if(typeof data.audio!=='string'||data.audio.length>3*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.audio)||!['audio/webm','audio/ogg','audio/wav','audio/mp4'].includes(data.mime))return json(res,400,{error:'不支持的录音格式或大小。'});
     const form=new FormData();form.set('model',transcribeModel);form.set('language','en');
     const extension={'audio/webm':'webm','audio/ogg':'ogg','audio/wav':'wav','audio/mp4':'m4a'}[data.mime];
     form.set('file',new Blob([Buffer.from(data.audio,'base64')],{type:data.mime}),'practice.'+extension);
     const result=await call('/audio/transcriptions',{method:'POST',body:form});
     if(typeof result.text!=='string')throw Error('transcription');transcript=result.text.trim().slice(0,2000);
    }else if(typeof data.text==='string'&&data.text.trim()&&data.text.length<=1000)transcript=data.text.trim();
    else return json(res,400,{error:'请先录音，或输入想说的话。'});
    if(!transcript)return json(res,422,{error:'这次没有听清，靠近麦克风再试一次。'});
    const history=Array.isArray(data.history)?data.history.slice(-6).filter(m=>['user','assistant'].includes(m?.role)&&typeof m.content==='string'&&m.content.length<=1000):[];
    const response=await call('/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:chatModel,max_tokens:300,messages:[{role:'system',content:'You are a warm beginner English tutor. Keep answers under 90 Chinese characters plus one short English example or question. Encourage without flattery. You receive transcription only, NOT audio, so NEVER diagnose pronunciation, tongue position, pitch, volume, or claim a voice is standard/perfect. You may give clearly labelled general practice tips. In conversation mode answer the meaning and ask one easy English question. In practice mode compare wording to the target, praise an accurate word, then suggest one next step. Never invent phonetic scores. Stay focused on age-appropriate learning.'},...history,{role:'user',content:JSON.stringify({mode:data.mode,target:lesson.text,generalTip:lesson.hint,learner:transcript})}]})});
    const reply=response.choices?.[0]?.message?.content;if(typeof reply!=='string'||!reply.trim())throw Error('response');
    json(res,200,{transcript,reply:reply.slice(0,2000),matchPercent:data.mode==='practice'&&lesson.stage!=='sound'?wordMatch(lesson.text,transcript):null,scoreLabel:'文字匹配度（非发音评分）'});
   }catch{if(!res.destroyed)json(res,502,{error:'AI 暂时没有回应。录音仍在本页，可以重试或继续本地练习。'});}
   finally{active--;res.removeListener('close',disconnect);}
   return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
  try{
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   const canonical=await realpath(path);if(!canonical.startsWith(root)||!canonical.startsWith(resolve(root)+sep))return json(res,403,{error:'Forbidden'});
   if(!(await stat(canonical)).isFile())return json(res,404,{error:'Not found'});
   const content=await readFile(canonical);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':content.length,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch{json(res,404,{error:'Not found'});}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4173);createApp().listen(port,'127.0.0.1',()=>console.log(`课堂已启动：http://127.0.0.1:${port}`));
}
