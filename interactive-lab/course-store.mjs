import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {LESSON_SERIES, LESSONS, LESSON_STAGES} from './dist/curriculum.js';
import {SCENES} from './dist/journey.js';
import {PHONEMES, LETTERS} from './dist/phonemes.js';

const scrypt = promisify(scryptCallback);
export const voices = ['female', 'male'];
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function fail(status, message) { throw Object.assign(new Error(message), {status}); }
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return {salt, hash:(await scrypt(password, salt, 64)).toString('hex')};
}
export async function checkPassword(password, credentials) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const value = await passwordHash(password, credentials.salt);
  return timingSafeEqual(Buffer.from(value.hash, 'hex'), Buffer.from(credentials.hash, 'hex'));
}
const plain = (value, label, max = 1000, optional = false) => {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()) || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, `${label}不能为空，也不能包含 HTML；最多 ${max} 字。`);
  return value.trim();
};
export const validId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id) && !['constructor', 'prototype', '__proto__'].includes(id);

export function validateCourse(input, id) {
  if (!input || !validId(id)) fail(400, '课程编号只能使用小写英文字母、数字和短横线。');
  const letter = input.letter;
  if (!Object.hasOwn(LETTERS, letter) || !Object.hasOwn(PHONEMES, input.soundId)) fail(400, '请选择有效的字母和重点音。');
  if (!Array.isArray(input.lessons) || input.lessons.length !== 4) fail(400, '每课需要字母音、单词、短语、句子四个阶段。');
  const lessons = input.lessons.map((value, index) => {
    const stage = LESSON_STAGES[index].id;
    const text = plain(value.text, '英文内容', 600).replace(/\s+/g,' ');
    if (!/^[a-zA-Z0-9\s.,!?;:'’“”"()\-]+$/.test(text)) fail(400, '英文内容仅支持英文、数字和常用标点。');
    const tokens = text.split(/\s+/);
    const sequences = value.audioPhonemes;
    if (!Array.isArray(sequences) || sequences.length !== tokens.length || sequences.some(row => !Array.isArray(row) || row.length > 40 || row.some(key => !Object.hasOwn(PHONEMES, key)))) fail(400, '音素需要与英文单词逐行对应，且使用有效的音素编号；不配置时每行留空。');
    if (stage === 'sound' && (tokens.length !== 1 || sequences[0].length !== 1 || sequences[0][0] !== input.soundId)) fail(400, '字母音阶段必须对应本课的重点音。');
    let duration = 0;
    const words = tokens.map((text, i) => ({text, sequence:sequences[i]}));
    const segments = words.flatMap((word, wordIndex) => word.sequence.map(id => {
      const start = duration; duration += PHONEMES[id].duration;
      return {id, start, end:duration, wordIndex};
    }));
    const audio = {};
    for (const voice of voices) {
      const item = value.audio?.[voice];
      if (!item || !['builtin','upload','elevenlabs','azure'].includes(item.source) || !['saved','dynamic'].includes(item.mode)) fail(400, '请选择有效的音频来源和播放方式。');
      if (item.mode === 'dynamic' && !['elevenlabs','azure'].includes(item.source)) fail(400, '动态语音仅支持 ElevenLabs 或 Azure。');
      if (stage === 'sound' && ['elevenlabs','azure'].includes(item.source)) fail(400, '孤立单音请使用内置示范或上传经过审核的录音，避免被读成字母名称。');
      audio[voice] = {source:item.source, mode:item.mode};
      if (item.source==='builtin' && typeof item.builtinId==='string' && Object.hasOwn(LESSONS,item.builtinId)) audio[voice].builtinId=item.builtinId;
      if (typeof item.assetId === 'string' && /^[a-f0-9]{64}$/.test(item.assetId)) audio[voice].assetId = item.assetId;
    }
    return {id:`${id}-${stage}`,seriesId:id,stage,text,translation:plain(value.translation,'中文含义',600),ipa:plain(value.ipa || '', '音标',600,true),hint:plain(value.hint,'跟读提示',1000),audioText:text,audioPhonemes:sequences,words,sequence:segments.map(s=>s.id),segments,duration:duration || Math.max(1,tokens.length * .4),audio};
  });
  const scene = input.scene;
  if (!scene || !Array.isArray(scene.choices) || scene.choices.length !== 3) fail(400, '请填写三个听音选择题选项。');
  const choices = scene.choices.map(value => plain(value,'选项',200));
  if (new Set(choices).size !== 3 || !choices.includes(scene.answer)) fail(400, '三个选项必须不同，正确答案必须是其中一项。');
  return {id,title:plain(input.title,'课程标题',100),letter,soundId:input.soundId,letterNameIpa:LETTERS[letter].ipa,soundIpa:PHONEMES[input.soundId].ipa,contrast:plain(input.contrast,'字母与发音提示',1000),lessonIds:lessons.map(l=>l.id),lessons,
    scene:{place:plain(scene.place,'情境标题',100),question:plain(scene.question,'情境问题',600),transfer:plain(scene.transfer,'拓展练习',600),choices,answer:scene.answer}};
}

export function seedCourse(series) {
  const {icon, ...scene} = SCENES[series.id];
  return {...structuredClone(series),scene,lessons:series.lessonIds.map(id=>({...structuredClone(LESSONS[id]),audio:Object.fromEntries(voices.map(v=>[v,{source:'builtin',mode:'saved'}]))}))};
}
export function builtinMatches(lesson, audio) {
  const original = LESSONS[audio.builtinId || lesson.id];
  return original && original.text === lesson.text && JSON.stringify(original.audioPhonemes) === JSON.stringify(lesson.audioPhonemes);
}
export function publicCourse(course) {
  const {lessons, ...series} = course;
  return {series, lessons};
}

export async function openStore(directory) {
  await mkdir(join(directory,'media'), {recursive:true, mode:0o700});
  const path = join(directory,'store.json');
  let state;
  try { state = JSON.parse(await readFile(path,'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = {schema:1,admin:{username:'admin',role:'admin',mustChangePassword:true,...await passwordHash('111111')},config:{revision:1,dailyCharacterLimit:50000,elevenlabs:{apiKey:'',modelId:'eleven_multilingual_v2',female:'',male:''},azure:{apiKey:'',region:'eastus',female:'en-GB-SoniaNeural',male:'en-GB-RyanNeural'}},usage:{date:'',characters:0},assets:{},courses:Object.fromEntries(LESSON_SERIES.map(series=>{const course=seedCourse(series);return [series.id,{revision:1,draft:course,published:structuredClone(course),publishedRevision:1}];}))};
    await writeFile(path, JSON.stringify(state), {mode:0o600,flag:'wx'});
  }
  if (state.schema !== 1 || !state.admin || !state.courses) throw Error('Invalid course store');
  let queue = Promise.resolve();
  return {
    directory,
    get state() { return state; },
    async update(change) {
      const operation = queue.then(async()=>{
        const next = structuredClone(state);
        const result = await change(next);
        const temporary = path + '.tmp';
        await writeFile(temporary, JSON.stringify(next), {mode:0o600});
        await rename(temporary,path);state=next;
        return result;
      });
      queue = operation.catch(()=>{});
      return operation;
    }
  };
}
