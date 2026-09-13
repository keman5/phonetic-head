import {CHANNELS,PHONEMES,LETTERS,CATEGORIES,makeTimeline,timelinePose} from './phonemes.js';
export const DURATION = 6;
export const SOUNDS = {
  p: {ipa:'/p/',word:'pen',title:'双唇爆破音',color:'#db825c',copy:'嘴唇先合拢，短暂挡住气息，然后轻轻打开。',tip:'手放在嘴前，感觉打开双唇时的一小股气。',steps:['合拢双唇','保持闭合','打开释放'],focus:['lips','jaw','velum'],},
  theta: {ipa:'/θ/',word:'three',title:'舌尖齿间擦音',color:'#4885ca',copy:'舌尖轻轻向前，放在上下门牙之间，让气息持续擦过。',tip:'不要咬紧舌头。观察舌尖的位置，保持缓慢呼气。',steps:['张开嘴唇','舌尖前伸','持续送气'],focus:['tongue','genio','lips','velum'],},
  i: {ipa:'/iː/',word:'see',title:'前高元音',color:'#8671b5',copy:'舌前部抬起，嘴角向两侧展开，声带参与发声。',tip:'观察舌头前部和嘴角，同时用手感受喉咙振动。',steps:['展开嘴角','抬高舌前部','持续发声'],focus:['tongue','genio','smile','voice','velum'],},
  k: {ipa:'/k/',word:'cat',title:'舌根爆破音',color:'#298b83',copy:'舌后部抬起，短暂接近并抵住腭后部，再放开发出气流。',tip:'对照准备、闭塞和释放，注意运动发生在口腔后部。',steps:['张开下颌','舌后部闭塞','放开释放'],focus:['tongue','genio','jaw','velum'],},
};
export const FOCUS = {
  tongue:{label:'舌体',match:n=>n==='Tongue',desc:'观察舌尖、舌前部和舌后部的不同形变。',keys:['TipForward','FrontHigh','BackSeal']},
  genio:{label:'颏舌肌',match:n=>n.includes('Genioglossus'),desc:'与舌体联动，演示舌头前伸和形状调整。这里显示的是教学形变。',keys:['TipForward','FrontHigh','BackSeal']},
  lips:{label:'口轮匝肌',match:n=>n.includes('Orbicularis oris'),desc:'环绕口唇，观察合拢双唇与放开时的变化。',keys:['LipClose','JawOpen']},
  jaw:{label:'咬肌与下颌',match:n=>n.includes('masseter')||n==='Mandible',desc:'下颌绕关节附近转动；咬肌下端随下颌移动，上端保持相对稳定。',keys:['JawOpen']},
  velum:{label:'软腭与腭咽肌',match:n=>n==='Soft palate'||n==='Uvula of palate'||n.includes('Palatopharyngeus'),desc:'这些口腔音中，软腭抬起。观察其后缘与咽部的关系。',keys:['VelumRaise']},
  smile:{label:'笑肌与颧肌',match:n=>n.includes('Risorius')||n.includes('Zygomaticus'),desc:'演示嘴角向两侧展开时，口周肌肉的协同变化。',keys:['LipSpread']},
  voice:{label:'喉部发声肌群',match:n=>/thyro-arytenoid|crico-arytenoid|Transverse arytenoid|Character vocal fold/.test(n),desc:'元音发声时以慢动作演示喉部肌群变化；动画频率不代表真实声带频率。',keys:['Voice']},
};
for(const focus of ['tongue','genio'])FOCUS[focus].keys.push('TipAlveolar','TongueRetroflex','TongueCenter','TongueLow','BackHigh','TongueGroove','TongueLateral');
FOCUS.lips.keys.push('LipSpread','LipRound','LipProtrude','LipBite','BreathPressure');
FOCUS.velum.keys.push('VelumLower');
FOCUS.voice.keys.push('GlottisClose','GlottisOpen','VocalTension');
for(const [id,p] of Object.entries(PHONEMES)){
 SOUNDS['ipa:'+id]={ipa:`/${p.ipa}/`,word:p.word,title:CATEGORIES[p.category],color:'#4885ca',copy:p.copy,tip:'观察舌位、口唇、软腭与气流的配合。',steps:['准备构形','保持 / 过渡','释放 / 收尾'],focus:p.focus,timeline:makeTimeline([id]),duration:3};
}
for(const [id,l] of Object.entries(LETTERS)){
 const timeline=makeTimeline(l.sequence);
 SOUNDS['letter:'+id]={ipa:`/${l.ipa}/`,word:id,title:`字母 ${id}`,color:'#298b83',copy:l.sequence.map(p=>`/${PHONEMES[p].ipa}/`).join(' → '),tip:'英式字母名称；动画按连续音素播放。',steps:['起音','连续构形','收尾'],focus:['tongue','lips','velum','voice'],timeline,duration:timeline.duration+1};
}
const alphabet=makeTimeline(Object.values(LETTERS).flatMap(l=>l.sequence));
let letterClip=0;
for(const l of Object.values(LETTERS))for(const id of l.sequence)alphabet.clips[letterClip++].letter=l.id;
SOUNDS.alphabet={...SOUNDS['letter:A'],title:'A–Z 连续播放',word:'A–Z',ipa:'A–Z',copy:'按 A 到 Z 的顺序连续演示，画面标明当前字母和音素。',timeline:alphabet,duration:alphabet.duration+1};
export const durationFor=id=>SOUNDS[id]?.duration||DURATION;
export function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
const LEGACY_MOTIONS={
 p:{weights:({t,seal,relax})=>({LipClose:seal,JawOpen:.38*smooth(.62,.76,t)*relax}),air:({t})=>smooth(.63,.66,t)*(1-smooth(.74,.83,t))},
 k:{weights:({hold,seal})=>({JawOpen:.65*hold,BackSeal:seal}),air:({t})=>smooth(.67,.70,t)*(1-smooth(.80,.88,t))},
 theta:{weights:({hold})=>({JawOpen:.5*hold,TipForward:hold}),air:({t})=>smooth(.35,.43,t)*(1-smooth(.85,.92,t))},
 i:{weights:({t,hold,voiceEnvelope})=>({JawOpen:.22*hold,FrontHigh:hold,LipSpread:hold,Voice:voiceEnvelope*(.5+.5*Math.sin(t*DURATION*Math.PI*8))}),air:({voiceEnvelope})=>voiceEnvelope},
};
export function poseAt(sound,t){
  if(!SOUNDS[sound])throw new RangeError('Unknown sound: '+sound);
  t=Math.max(0,Math.min(1,t));
  if(SOUNDS[sound].timeline)return timelinePose(SOUNDS[sound].timeline,t*SOUNDS[sound].timeline.duration);
  const rise=smooth(.03,.30,t),relax=1-smooth(.88,1,t),seal=rise*(1-smooth(.62,.76,t));
  const hold=rise*relax,voiceEnvelope=smooth(.40,.48,t)*(1-smooth(.85,.92,t));
  const weights={...Object.fromEntries(CHANNELS.map(k=>[k,0])),VelumRaise:.8*hold};
  const context={t,seal,relax,hold,voiceEnvelope},motion=LEGACY_MOTIONS[sound];
  Object.assign(weights,motion.weights(context));const air=motion.air(context);
  const step=t<.3?0:t<.62?1:2;
  return {weights,air,step,t,voiced:sound==='i'&&voiceEnvelope>.1};
}
export const DEFAULT_ALPHA={left:0,right:100,skin:100,bone:75,muscle:10,organ:0};
export function effectiveOpacity(side,layer,state){return (1-state[side]/100)*(1-(state[layer]??state.skin)/100);}
