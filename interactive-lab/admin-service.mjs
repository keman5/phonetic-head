import {randomBytes} from 'node:crypto';
import {openStore,checkPassword,passwordHash,validateCourse,builtinMatches,publicCourse,validId,voices,digest,fail} from './course-store.mjs';
import {createSpeech,recipeFor,audioEntry,MAX_AUDIO_BYTES} from './speech.mjs';

const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req,max=256*1024) {
  if (Number(req.headers['content-length'])>max) fail(413,'上传内容过大。');
  let size=0;const chunks=[];
  for await(const chunk of req) {size+=chunk.length;if(size>max) fail(413,'上传内容过大。');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function readJSON(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415,'需要 JSON 请求。');
  try {const data=JSON.parse(await body(req));if(!data||typeof data!=='object'||Array.isArray(data)) fail(400,'请求格式不正确。');return data;}
  catch(error) {if(error.status) throw error;fail(400,'请求格式不正确。');}
}
function safeConfig(config) {
  const result=structuredClone(config);
  for(const provider of ['elevenlabs','azure']) {result[provider].configured=!!result[provider].apiKey;delete result[provider].apiKey;}
  return result;
}
function configUpdate(input,current) {
  if(input.revision!==current.revision) fail(409,'语音配置已被修改，请刷新后重试。');
  if(!Number.isInteger(input.dailyCharacterLimit)||input.dailyCharacterLimit<0||input.dailyCharacterLimit>1000000) fail(400,'每日生成上限需要在 0–1000000 字符之间。');
  const next={revision:current.revision+1,dailyCharacterLimit:input.dailyCharacterLimit};
  for(const provider of ['elevenlabs','azure']) {
    const value=input[provider];
    if(!value||typeof value.apiKey!=='string'||value.apiKey.length>512||/[\s\x00-\x1f]/.test(value.apiKey)) fail(400,'API 密钥格式不正确。');
    next[provider]={apiKey:value.clearKey?'':value.apiKey||current[provider].apiKey};
    for(const key of ['female','male',provider==='azure'?'region':'modelId']) {
      if(typeof value[key]!=='string'||value[key].length>100||(!value[key]&& !['female','male'].includes(key))||!(/^[A-Za-z0-9_-]*$/).test(value[key])) fail(400,'地区、模型或音色编号格式不正确。');
      next[provider][key]=value[key];
    }
    if(provider==='azure'&&!/^[a-z][a-z0-9]{1,40}$/.test(value.region)) fail(400,'Azure 地区示例：eastus、southeastasia。');
  }
  return next;
}

export function createAdministration({dataDir,fetchImpl=fetch}) {
  const ready=openStore(dataDir).then(store=>({store,speech:createSpeech(store,fetchImpl)}));
  // Attach a handler immediately so initialization failures are reported by requests, not as unhandled rejections.
  ready.catch(()=>{});
  const sessions=new Map(),attempts=new Map();let logins=0;
  const sessionFor=req=>{
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('classroom_session='))?.slice(18);
    const session=sessions.get(token);
    if(session&&session.expires>Date.now()) return {token,...session};
    if(token) sessions.delete(token);return null;
  };
  const setCookie=(res,token,secure,expires=28800)=>res.setHeader('Set-Cookie',`classroom_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expires}${secure?'; Secure':''}`);
  const revision=(record,value)=>{if(!record) fail(404,'课程不存在。');if(record.revision!==value) fail(409,'课程已被其他操作修改，请重新加载后编辑。');};
  const assetURL=asset=>`/api/media/${asset.id}.${asset.format}`;

  return {
    ready,
    async lesson(id) {const {store}=await ready;return Object.values(store.state.courses).flatMap(record=>record.published?.lessons||[]).find(lesson=>lesson.id===id);},
    async handle(req,res,url,origin) {
      const pathname=url.pathname;
      if(!(/^\/api\/(admin(?:\/|$)|curriculum$|lesson-audio\/|media\/|health$)/).test(pathname)) return false;
      try {
        const {store,speech}=await ready;
        if(pathname==='/api/health'&&req.method==='GET') {json(res,200,{ok:true});return true;}
        if(pathname==='/api/curriculum'&&req.method==='GET') {
          const series=[],lessons={};
          for(const record of Object.values(store.state.courses)) {
            if(!record.published) continue;
            const course=publicCourse(record.published);series.push(course.series);
            for(const original of course.lessons) {
              const lesson=structuredClone(original);lesson.audio={};
              for(const voice of voices) {
                const audio=original.audio[voice];
                lesson.audio[voice]=audio.source==='builtin'?{source:'builtin',builtinId:audio.builtinId||lesson.id}:{source:audio.source,mode:audio.mode,resolveURL:`/api/lesson-audio/${lesson.id}/${voice}?revision=${record.publishedRevision}`};
                if(audio.assetId) {const asset=store.state.assets[audio.assetId];lesson.audio[voice].entry=audioEntry(asset,lesson);}
              }
              if(!lesson.sequence.length) lesson.hint+=' 此内容暂未配置口型演示，请先听声音并跟读。';
              lessons[lesson.id]=lesson;
            }
          }
          json(res,200,{series,lessons});return true;
        }
        const media=pathname.match(/^\/api\/media\/([a-f0-9]{64})\.(wav|mp3)$/);
        if(media&&['GET','HEAD'].includes(req.method)) {
          const asset=store.state.assets[media[1]];
          if(!asset||asset.format!==media[2]) fail(404,'音频不存在。');
          const published=Object.values(store.state.courses).some(record=>record.published?.lessons.some(lesson=>Object.values(lesson.audio).some(audio=>audio.assetId===asset.id||audio.recipe&&digest(audio.recipe)===asset.recipe)));
          if(!published&&!sessionFor(req)) fail(404,'音频尚未发布。');
          const bytes=await speech.read(asset);
          res.writeHead(200,{'Content-Type':asset.format==='wav'?'audio/wav':'audio/mpeg','Content-Length':bytes.length,'Cache-Control':published?'public, max-age=31536000, immutable':'private, no-store'});res.end(req.method==='HEAD'?undefined:bytes);return true;
        }
        const audioMatch=pathname.match(/^\/api\/lesson-audio\/([a-z][a-z0-9-]{0,80})\/(female|male)(\/file)?$/);
        if(audioMatch&&req.method==='GET') {
          const [,id,voice,file]=audioMatch;
          const record=Object.values(store.state.courses).find(record=>record.published?.lessons.some(lesson=>lesson.id===id));
          if(!record) fail(404,'课程尚未发布。');
          if(String(record.publishedRevision)!==url.searchParams.get('revision')) fail(409,'课程已更新，请刷新页面后播放。');
          const lesson=record.published.lessons.find(lesson=>lesson.id===id),audio=lesson.audio[voice];
          if(audio.source==='builtin') {res.writeHead(302,{Location:`/assets/audio/${voice}/lesson-${audio.builtinId||id}.wav`,'Cache-Control':'no-store'});res.end();return true;}
          const asset=audio.mode==='dynamic'?await speech.generate(audio.recipe):store.state.assets[audio.assetId];
          if(!asset) fail(404,'课程音频暂不可用。');
          if(file) {res.writeHead(302,{Location:assetURL(asset),'Cache-Control':'no-store'});res.end();}
          else json(res,200,{url:assetURL(asset),entry:audioEntry(asset,lesson)});
          return true;
        }
        if(!pathname.startsWith('/api/admin/')) fail(404,'接口不存在。');
        if(!['GET','POST','PUT'].includes(req.method)) fail(405,'不支持此操作。');
        if(req.method!=='GET'&&req.headers.origin!==origin) fail(403,'请从本站管理页面发起操作。');
        if(pathname==='/api/admin/login'&&req.method==='POST') {
          const ip=req.socket.remoteAddress || 'local',now=Date.now();
          for(const [key,value] of attempts) if(now-value.start>15*60*1000) attempts.delete(key);
          const attempt=attempts.get(ip)||{start:now,count:0};
          if(attempt.count>=10||logins>=4) fail(429,'登录尝试过多，请 15 分钟后再试。');
          const data=await readJSON(req);attempt.count++;attempts.set(ip,attempt);logins++;
          let valid;
          try {valid=await checkPassword(data.password,store.state.admin);} finally {logins--;}
          if(data.username!=='admin'||!valid) fail(401,'账号或密码不正确。');
          attempts.delete(ip);
          for(const [token,session] of sessions) if(session.expires<now) sessions.delete(token);
          if(sessions.size>=100) sessions.delete(sessions.keys().next().value);
          const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
          sessions.set(token,{csrf,expires:now+8*60*60*1000});setCookie(res,token,origin.startsWith('https:'));
          json(res,200,{username:'admin',role:'admin',mustChangePassword:store.state.admin.mustChangePassword,csrf});return true;
        }
        const session=sessionFor(req);
        if(!session) fail(401,'请先登录管理端。');
        if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf) fail(403,'登录状态已失效，请重新登录。');
        if(pathname==='/api/admin/session'&&req.method==='GET') {json(res,200,{username:'admin',role:'admin',mustChangePassword:store.state.admin.mustChangePassword,csrf:session.csrf});return true;}
        if(pathname==='/api/admin/logout'&&req.method==='POST') {sessions.delete(session.token);setCookie(res,'',origin.startsWith('https:'),0);json(res,200,{ok:true});return true;}
        if(pathname==='/api/admin/password'&&req.method==='POST') {
          const data=await readJSON(req);
          if(typeof data.password!=='string'||data.password.length<10||data.password.length>128||data.password==='111111') fail(400,'新密码需要 10–128 个字符。');
          const before=store.state.admin.hash;
          if(!await checkPassword(data.currentPassword,store.state.admin)) fail(403,'当前密码不正确。');
          const credentials=await passwordHash(data.password);
          await store.update(state=>{if(state.admin.hash!==before) fail(409,'密码刚刚发生变化，请重新登录。');state.admin={...state.admin,...credentials,mustChangePassword:false};});
          sessions.clear();setCookie(res,'',origin.startsWith('https:'),0);json(res,200,{ok:true});return true;
        }
        if(store.state.admin.mustChangePassword) fail(403,'首次登录请先修改默认密码。');
        if(pathname==='/api/admin/state'&&req.method==='GET') {
          json(res,200,{courses:store.state.courses,assets:store.state.assets,config:safeConfig(store.state.config),usage:store.state.usage});return true;
        }
        if(pathname==='/api/admin/config'&&req.method==='PUT') {
          const data=await readJSON(req);
          await store.update(state=>{state.config=configUpdate(data,state.config);});json(res,200,safeConfig(store.state.config));return true;
        }
        if(pathname==='/api/admin/courses'&&req.method==='POST') {
          const data=await readJSON(req);
          if(!validId(data.id)) fail(400,'课程编号请使用小写英文、数字和短横线。');
          await store.update(state=>{
            if(Object.keys(state.courses).length>=200) fail(400,'最多可管理 200 门课程。');
            if(Object.hasOwn(state.courses,data.id)) fail(409,'课程编号已经存在。');
            const template=state.courses[data.templateId]?.draft;
            if(!template) fail(400,'请选择要复制的课程。');
            const course=structuredClone(template);course.id=data.id;course.title+='（副本）';
            course.lessons.forEach(lesson=>{
              const oldId=lesson.id;lesson.id=`${data.id}-${lesson.stage}`;lesson.seriesId=data.id;
              for(const voice of voices) if(lesson.audio[voice].source==='builtin') lesson.audio[voice].builtinId ||= oldId;
            });course.lessonIds=course.lessons.map(lesson=>lesson.id);
            state.courses[data.id]={revision:1,draft:course,published:null,publishedRevision:0};
          });json(res,201,{id:data.id});return true;
        }
        const match=pathname.match(/^\/api\/admin\/courses\/([a-z][a-z0-9-]{0,63})(?:\/(publish|unpublish|generate|upload))?$/);
        if(match) {
          const [,id,action]=match;
          if(!validId(id)||!Object.hasOwn(store.state.courses,id)) fail(404,'课程不存在。');
          if(!action&&req.method==='PUT') {
            const data=await readJSON(req),course=validateCourse(data.course,id);
            await store.update(state=>{const record=state.courses[id];revision(record,data.revision);record.draft=course;record.revision++;});
            json(res,200,store.state.courses[id]);return true;
          }
          if(['publish','unpublish'].includes(action)&&req.method==='POST') {
            const data=await readJSON(req);
            await store.update(state=>{
              const record=state.courses[id];revision(record,data.revision);
              if(action==='unpublish') {
                if(Object.values(state.courses).filter(c=>c.published).length<=1) fail(400,'至少保留一门已发布课程。');
                record.published=null;
              } else {
                const course=validateCourse(record.draft,id);
                for(const lesson of course.lessons) for(const voice of voices) {
                  const audio=lesson.audio[voice],label=`${lesson.text}（${voice==='female'?'女声':'男声'}）`;
                  if(audio.source==='builtin') {if(!builtinMatches(lesson,audio)) fail(422,label+' 的内容已经改变，请重新配音。');}
                  else if(audio.mode==='dynamic') {audio.recipe=recipeFor(state.config,audio.source,voice,lesson);delete audio.assetId;}
                  else {
                    const asset=state.assets[audio.assetId];
                    if(!asset||asset.textHash!==digest(lesson.audioText)||asset.provider!==audio.source) fail(422,label+' 缺少与当前内容匹配的音频，请上传或生成后再发布。');
                  }
                }
                record.published=course;
              }
              record.revision++;record.publishedRevision=record.revision;record.publishedAt=new Date().toISOString();
            });json(res,200,store.state.courses[id]);return true;
          }
          if(['generate','upload'].includes(action)&&req.method==='POST') {
            let data,bytes;
            if(action==='upload') {
              data={stage:url.searchParams.get('stage'),voice:url.searchParams.get('voice'),revision:Number(req.headers['x-course-revision'])};bytes=await body(req,MAX_AUDIO_BYTES);
            } else data=await readJSON(req);
            const record=store.state.courses[id];revision(record,data.revision);
            const lesson=record.draft.lessons.find(l=>l.stage===data.stage);
            if(!lesson||!voices.includes(data.voice)) fail(400,'请选择课程阶段和声音。');
            if(action==='generate'&&lesson.stage==='sound') fail(422,'孤立单音请上传经过审核的录音。');
            const asset=action==='upload'?await speech.upload(bytes,lesson):await speech.generate(recipeFor(store.state.config,data.provider,data.voice,lesson),{force:true});
            await store.update(state=>{
              const current=state.courses[id];revision(current,data.revision);
              current.draft.lessons.find(l=>l.stage===data.stage).audio[data.voice]={source:asset.provider,mode:'saved',assetId:asset.id};current.revision++;
            });json(res,200,store.state.courses[id]);return true;
          }
        }
        fail(404,'接口不存在。');
      } catch(error) {
        if(!res.headersSent) json(res,error.status||500,{error:error.status?error.message:'管理服务暂时不可用，请稍后重试。'});
      }
      return true;
    }
  };
}
