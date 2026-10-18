import {PHONEMES,LETTERS,CATEGORIES,makeTimeline,timelinePose,phonemePose,blend} from './phonemes.js';
export const SOUNDS = {};
export const FOCUS = {
  tongue:{label:'舌体',match:n=>n==='Tongue',desc:'观察舌尖、舌前部和舌后部的不同形变。',keys:['TipForward','FrontHigh','BackSeal']},
  genio:{label:'颏舌肌',match:n=>n.includes('Genioglossus'),desc:'与舌体联动，演示舌头前伸和形状调整。这里显示的是教学形变。',keys:['TipForward','FrontHigh','BackSeal']},
  lips:{label:'口轮匝肌',match:n=>n.includes('Orbicularis oris'),desc:'环绕口唇，观察合拢双唇与放开时的变化。',keys:['LipClose','JawOpen']},
  jaw:{label:'咬肌与下颌',match:n=>n.includes('masseter')||n==='Mandible',desc:'下颌绕关节附近转动；咬肌下端随下颌移动，上端保持相对稳定。',keys:['JawOpen']},
  velum:{label:'软腭与腭咽肌',match:n=>n==='Soft palate'||n==='Uvula of palate'||n.includes('Palatopharyngeus'),desc:'观察软腭升降；鼻音时下降，气流转向鼻腔。',keys:['VelumRaise']},
  smile:{label:'笑肌与颧肌',match:n=>n.includes('Risorius')||n.includes('Zygomaticus'),desc:'演示嘴角向两侧展开时，口周肌肉的协同变化。',keys:['LipSpread']},
  voice:{label:'喉部发声肌群',match:n=>/thyro-arytenoid|crico-arytenoid|Transverse arytenoid|Character vocal fold/.test(n),desc:'元音发声时以慢动作演示喉部肌群变化；动画频率不代表真实声带频率。',keys:['Voice']},
};
for(const focus of ['tongue','genio'])FOCUS[focus].keys.push('TipAlveolar','TongueRetroflex','TongueCenter','TongueLow','BackHigh','TongueGroove','TongueLateral');
FOCUS.lips.keys.push('LipSpread','LipRound','LipProtrude','LipBite','BreathPressure');
FOCUS.velum.keys.push('VelumLower');
FOCUS.voice.keys.push('GlottisClose','GlottisOpen','VocalTension');
for(const [id,p] of Object.entries(PHONEMES)){
 SOUNDS['ipa:'+id]={ipa:`/${p.ipa}/`,word:p.word,title:CATEGORIES[p.category],color:'#4885ca',copy:p.copy,tip:'观察舌位、口唇、软腭与气流的配合。',steps:['准备构形','保持 / 过渡','释放 / 收尾'],focus:p.focus,timeline:makeTimeline([id]),duration:3};
 if(['vowel','diphthong'].includes(p.category)){
  SOUNDS['ipa:'+id].focus=['lips','jaw','tongue','velum','voice'];
  SOUNDS['ipa:'+id].steps=p.category==='diphthong'?['起始元音','滑向尾音','尾音口型']:['起始口型','保持元音','收尾口型'];
 }
}
for(const [id,l] of Object.entries(LETTERS)){
 const timeline=makeTimeline(l.sequence);
 SOUNDS['letter:'+id]={ipa:`/${l.ipa}/`,word:id,title:`字母 ${id}`,color:'#298b83',copy:l.sequence.map(p=>`/${PHONEMES[p].ipa}/`).join(' → '),tip:'英式字母名称；动画按连续音素播放。',steps:['起音','连续构形','收尾'],focus:['tongue','lips','velum','voice'],timeline,duration:timeline.duration+1};
}
const alphabet=makeTimeline(Object.values(LETTERS).flatMap(l=>l.sequence));
let letterClip=0;
for(const l of Object.values(LETTERS))for(const id of l.sequence)alphabet.clips[letterClip++].letter=l.id;
SOUNDS.alphabet={...SOUNDS['letter:A'],title:'A–Z 连续播放',word:'A–Z',ipa:'A–Z',copy:'按 A 到 Z 的顺序连续演示，画面标明当前字母和音素。',timeline:alphabet,duration:alphabet.duration+1};
export const durationFor=id=>SOUNDS[id]?.duration||3;
export function poseAt(sound,t){
  if(!SOUNDS[sound])throw new RangeError('Unknown sound: '+sound);
  t=Math.max(0,Math.min(1,t));
  const p=sound.startsWith('ipa:')&&PHONEMES[sound.slice(4)];
  if(p&&['vowel','diphthong'].includes(p.category)){
    const smooth=(a,b,x)=>{const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);};
    const pose=phonemePose(p.id,smooth(.4,.75,t));
    const envelope=smooth(0,.2,t)*(1-smooth(.87,1,t));
    return {...pose,weights:blend({},pose.weights,envelope),air:pose.air*envelope,voiced:envelope>.1,phoneme:p.id,phonemeProgress:t,step:t<.4?0:t<.75?1:2,t};
  }
  return timelinePose(SOUNDS[sound].timeline,t*SOUNDS[sound].timeline.duration);
}
export const DEFAULT_ALPHA={left:0,right:100,skin:100,bone:75,muscle:10,organ:0};
export function effectiveOpacity(side,layer,state){return (1-state[side]/100)*(1-(state[layer]??state.skin)/100);}
