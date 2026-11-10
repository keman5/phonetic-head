import {t, localizeCourse} from './i18n.js';
export const DEMONSTRATION_RATE = 1;
import {PHONEMES, LETTERS} from './phonemes.js';

export const LESSON_STAGES = [
  {id:'sound', label:t('字母音')}, {id:'word', label:t('单词')},
  {id:'phrase', label:t('短语')}, {id:'sentence', label:t('句子')}
];

// Each word keeps its own phonemes so playback can highlight words without guessing spelling.
const words = {
  dog:['d','o','g'], big:['b','ih','g'], this:['dh','ih','s'], is:['ih','z'], a:['schwa'],
  cat:['k','ae','t'], black:['b','l','ae','k'],
  fish:['f','ih','sh'], red:['r','e','d'],
  milk:['m','ih','l','k'], cold:['k','ou','l','d'], I:['ai'], like:['l','ai','k'],
  rabbit:['r','ae','b','ih','t'], white:['w','ai','t'], bird:['b','er','d'], little:['l','ih','t','schwa','l'],
  duck:['d','uh','k'], yellow:['j','e','l','ou'], horse:['h','aw','s'], brown:['b','r','au','n'],
  lion:['l','ai','schwa','n'], panda:['p','ae','n','d','schwa'], cute:['k','j','u','t']
};

export const LESSON_SERIES = [
  {id:'dog', title:t('认识一只大狗'), letter:'D', soundId:'d',
    contrast:t('字母 D 的名称读 /diː/；dog 开头的 d 发 /d/，不要在后面加 /iː/ 或“得”的元音。'),
    examples:[
      ['d',t('字母 d 在 dog 中的声音'),'d',t('舌尖轻触上门牙后面的齿龈，再松开；不要额外加一个元音。')],
      ['dog',t('狗'),'dɒɡ',t('把 /d/、/ɒ/、/ɡ/ 连成一个词；末尾 /ɡ/ 后不要加“呃”。')],
      ['big dog',t('大狗'),'bɪɡ dɒɡ',t('big 和 dog 连贯读；/ɡ/ 接 /d/ 时不要插入元音。')],
      ['This is a big dog.',t('这是一只大狗。'),'ðɪs ɪz ə bɪɡ ˈdɒɡ',t('this 的 th 是 /ð/；a 轻读 /ə/，重点听 big dog，句末自然收住。')]
    ]},
  {id:'cat', title:t('认识一只黑猫'), letter:'C', soundId:'k',
    contrast:t('字母 C 的名称读 /siː/；cat 中的 c 发 /k/。字母在不同单词中可能发不同的音。'),
    examples:[
      ['c',t('字母 c 在 cat 中的声音'),'k',t('舌头后部轻轻抬起挡住气流，再松开；不用使劲挤喉咙。')],
      ['cat',t('猫'),'kæt',t('嘴巴打开读 /æ/，再轻轻收住末尾 /t/；不要读成字母 C 的名称。')],
      ['black cat',t('黑猫'),'blæk kæt',t('black 开头 /b/ 与 /l/ 连起来，不加元音；两个 /k/ 交界可以连贯过渡。')],
      ['This is a black cat.',t('这是一只黑猫。'),'ðɪs ɪz ə blæk ˈkæt',t('a 轻读 /ə/；把 black cat 当成一个意思组读，不要每个音都停一下。')]
    ]},
  {id:'fish', title:t('认识一条红鱼'), letter:'F', soundId:'f',
    contrast:t('字母 F 的名称读 /ef/；fish 开头的 f 只发 /f/，前面不加 /e/。'),
    examples:[
      ['f',t('字母 f 在 fish 中的声音'),'f',t('下唇轻触上门牙，让气轻轻擦过去；不要咬紧嘴唇。')],
      ['fish',t('鱼'),'fɪʃ',t('sh 两个字母一起发 /ʃ/；听清 /ɪ/，不要拉成长音 /iː/。')],
      ['red fish',t('红鱼'),'red fɪʃ',t('red 末尾 /d/ 接 fish 的 /f/，中间不加元音；英语 r 不弹舌。')],
      ['This is a red fish.',t('这是一条红鱼。'),'ðɪs ɪz ə red ˈfɪʃ',t('先听完整一句，再跟读；a 轻读 /ə/，red fish 说清楚。')]
    ]},
  {id:'milk', title:t('说说喜欢的牛奶'), letter:'M', soundId:'m',
    contrast:t('字母 M 的名称读 /em/；milk 开头的 m 只发 /m/，前面不加 /e/。'),
    examples:[
      ['m',t('字母 m 在 milk 中的声音'),'m',t('双唇轻轻合上，声音从鼻子出来；不要捏鼻子或憋气。')],
      ['milk',t('牛奶'),'mɪlk',t('读完 /mɪ/，舌尖接 /l/ 再到 /k/；不要在两个辅音之间加元音。')],
      ['cold milk',t('冷牛奶'),'kəʊld mɪlk',t('cold 中 /əʊ/ 连续滑动；milk 是不可数名词，这里不加 a。')],
      ['I like cold milk.',t('我喜欢冷牛奶。'),'aɪ laɪk kəʊld ˈmɪlk',t('I 和 like 都有 /aɪ/；把 cold milk 连贯读，句末自然降下来。')]
    ]},
  {id:'rabbit', title:t('认识一只白兔'), letter:'R', soundId:'r',
    contrast:t('字母 R 的英式名称读 /ɑː/；rabbit 开头的 r 发英语近音 /r/（实际为 [ɹ]），舌尖不弹动。'),
    examples:[
      ['r',t('字母 r 在 rabbit 中的声音'),'r',t('舌头轻轻后收，不碰上腭，也不弹舌。')],
      ['rabbit',t('兔子'),'ˈræbɪt',t('第一个音节读得更清楚；第二个音节是短 /ɪ/，末尾 /t/ 后不加元音。')],
      ['white rabbit',t('白兔'),'waɪt ˈræbɪt',t('white 的 /aɪ/ 连续滑动，再接 rabbit；词间不插入“呃”。')],
      ['This is a white rabbit.',t('这是一只白兔。'),'ðɪs ɪz ə waɪt ˈræbɪt',t('a 轻读 /ə/；white rabbit 连成一个意思组，rabbit 的重音在前。')]
    ]},
  {id:'bird', title:t('认识一只小鸟'), letter:'B', soundId:'b',
    contrast:t('字母 B 的名称读 /biː/；bird 开头的 b 只发 /b/，后面不加 /iː/。'),
    examples:[
      ['b',t('字母 b 在 bird 中的声音'),'b',t('双唇轻合再松开，声音短而轻，不加“呃”。')],
      ['bird',t('鸟'),'bɜːd',t('中间 /ɜː/ 舌头放在中间；这里采用非卷舌英式读法，不另加 /r/。')],
      ['little bird',t('小鸟'),'ˈlɪtəl bɜːd',t('little 的第一个音节更清楚，后面的 /ə/ 轻读，再接 bird。')],
      ['This is a little bird.',t('这是一只小鸟。'),'ðɪs ɪz ə ˈlɪtəl ˈbɜːd',t('先完整听一句；a 轻读，把 little bird 清楚地说出来。')]
    ]},
  {id:'duck', title:t('认识一只黄鸭'), letter:'D', soundId:'d',
    contrast:t('字母 D 的名称读 /diː/；duck 开头的 d 只发 /d/，和 dog 开头相同，后面的元音不同。'),
    examples:[
      ['d',t('字母 d 在 duck 中的声音'),'d',t('舌尖轻触齿龈再松开；不把字母名称 /diː/ 加进词里。')],
      ['duck',t('鸭子'),'dʌk',t('中间 /ʌ/ 嘴唇放松，不像 dog 的 /ɒ/ 那样轻圆唇。')],
      ['yellow duck',t('黄鸭'),'ˈjeləʊ dʌk',t('yellow 的重音在前，尾音 /əʊ/ 平滑滑动，再接 duck。')],
      ['This is a yellow duck.',t('这是一只黄鸭。'),'ðɪs ɪz ə ˈjeləʊ ˈdʌk',t('a 轻读 /ə/；yellow duck 连贯说，duck 末尾不加元音。')]
    ]},
  {id:'horse', title:t('认识一匹棕马'), letter:'H', soundId:'h',
    contrast:t('字母 H 的名称读 /eɪtʃ/；horse 开头的 h 只发 /h/，像轻轻呼气。'),
    examples:[
      ['h',t('字母 h 在 horse 中的声音'),'h',t('张开口轻轻送气，不需要使劲挤喉咙。')],
      ['horse',t('马'),'hɔːs',t('/ɔː/ 圆唇，末尾是 /s/；非卷舌英式读法中不另加 /r/。')],
      ['brown horse',t('棕马'),'braʊn hɔːs',t('brown 的 /aʊ/ 连续滑动，/b/ 与 /r/ 之间不加元音。')],
      ['This is a brown horse.',t('这是一匹棕马。'),'ðɪs ɪz ə braʊn ˈhɔːs',t('a 轻读，brown horse 说清楚；horse 结尾是轻轻的摩擦音。')]
    ]},
  {id:'lion', title:t('认识一只大狮子'), letter:'L', soundId:'l',
    contrast:t('字母 L 的名称读 /el/；lion 开头的 l 只发 /l/，前面不加 /e/。'),
    examples:[
      ['l',t('字母 l 在 lion 中的声音'),'l',t('舌尖轻触上门牙后面的齿龈，让声音从舌头两侧通过。')],
      ['lion',t('狮子'),'ˈlaɪən',t('lion 有两个音节；/aɪ/ 滑向轻短的 /ə/，末尾 /n/ 不加元音。')],
      ['big lion',t('大狮子'),'bɪɡ ˈlaɪən',t('big 的 /ɡ/ 连向 lion 的 /l/，中间不加额外的声音。')],
      ['This is a big lion.',t('这是一只大狮子。'),'ðɪs ɪz ə bɪɡ ˈlaɪən',t('a 轻读，lion 的第一个音节读得清楚；句末自然收住。')]
    ]},
  {id:'panda', title:t('认识一只可爱熊猫'), letter:'P', soundId:'p',
    contrast:t('字母 P 的名称读 /piː/；panda 开头的 p 只发 /p/，后面不加 /iː/。'),
    examples:[
      ['p',t('字母 p 在 panda 中的声音'),'p',t('双唇轻合再松开，送出一小口气；不要用力喷气。')],
      ['panda',t('熊猫'),'ˈpændə',t('第一个音节更清楚，末尾 a 轻读 /ə/，不要把两个音节读得一样重。')],
      ['cute panda',t('可爱的熊猫'),'kjuːt ˈpændə',t('cute 开头是 /k/ 接 /j/；panda 的尾音仍然轻短。')],
      ['This is a cute panda.',t('这是一只可爱的熊猫。'),'ðɪs ɪz ə kjuːt ˈpændə',t('先听整句再跟读；a 和 panda 的尾音都是轻读 /ə/。')]
    ]}
];

export const LESSONS = {};
for (const series of LESSON_SERIES) {
  series.letterNameIpa = LETTERS[series.letter].ipa;
  series.soundIpa = PHONEMES[series.soundId].ipa;
  series.lessonIds = [];
  for (const [index, [text, translation, ipa, hint]] of series.examples.entries()) {
    const stage = LESSON_STAGES[index].id;
    const id = `${series.id}-${stage}`;
    const tokens = text.replace(/[.]/g, '').split(' ');
    const lessonWords = tokens.map(text => ({text, sequence:stage === 'sound'
      ? [series.soundId] : words[text === 'This' ? 'this' : text]}));
    let duration = 0;
    // shortcut: these are illustrative timings; use measured audio alignment before claiming lip sync.
    const segments = lessonWords.flatMap((word, wordIndex) => word.sequence.map(id => {
      const start = duration;
      duration += PHONEMES[id].duration;
      return {id, start, end:duration, wordIndex};
    }));
    LESSONS[id] = {id, seriesId:series.id, stage, text, translation, ipa, hint,
      audioText:text, audioPhonemes:lessonWords.map(word => word.sequence),
      words:lessonWords, sequence:segments.map(segment => segment.id), segments, duration};
    series.lessonIds.push(id);
  }
  delete series.examples;
}

export function lessonAudioURL(id,voice='female') {
  const audio=LESSONS[id]?.audio?.[voice];
  if(audio?.resolveURL){const url=new URL(audio.resolveURL,location.href);url.pathname+='/file';return url.href;}
  return new URL(`./assets/audio/${voice}/lesson-${audio?.builtinId||id}.wav`,import.meta.url).href;
}

// Keep the static export usable for offline builds and serve published edits when a CMS is present.
if (typeof window !== 'undefined' && /^https?:$/.test(location.protocol)) {
  try {
    const response = await fetch('/api/curriculum', {cache:'no-store',signal:AbortSignal.timeout(8000)});
    if (response.ok) {
      const catalog = await response.json();
      if (Array.isArray(catalog.series) && catalog.series.length && catalog.lessons) {
        LESSON_SERIES.splice(0,LESSON_SERIES.length,...catalog.series.map(localizeCourse));
        for (const id of Object.keys(LESSONS)) delete LESSONS[id];
        Object.assign(LESSONS,Object.fromEntries(Object.entries(catalog.lessons).map(([id, lesson])=>[id,localizeCourse(lesson)])));
      }
    }
  } catch { /* Offline lessons remain available if the management service is unreachable. */ }
}
