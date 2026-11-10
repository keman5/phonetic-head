import {t} from './i18n.js';
import {PHONEMES} from './phonemes.js';

// Preserve the atlas geometry; the children's view removes distracting structures.
export function teachingRole(meta){
  const name=meta.anatomyName||'';
  if(meta.variant&&meta.variant!=='human')return 'character';
  if(meta.layer==='skin'||meta.layer==='eye')return 'surface';
  if(name==='Tongue')return 'tongue';
  if(/^(Upper|Lower) /.test(name))return 'teeth';
  if(name==='Hard palate')return 'hard-palate';
  if(/Soft palate|Uvula of palate/.test(name))return 'palate';
  if(name==='Gingiva')return 'gum';
  // Epiglottis is useful for swallowing lessons, but its thin flap distracts
  // from the pronunciation targets. It remains in the teacher reference.
  if(name==='Trachea')return 'airway';
  // The large outer laryngeal muscle sheets are not the vocal folds. Keep a
  // small location reference; the labelled inset explains the actual folds.
  if(name==='Transverse arytenoid muscle')return 'voice';
  return 'detail';
}
export const CHILD_LABELS={lips:t('嘴唇'),jaw:t('下巴'),tongue:t('舌头'),genio:t('舌头的帮手'),smile:t('嘴角'),velum:t('软腭 · 小门'),voice:t('声带 · 小马达')};
export const CONTRASTS={i:'ih',ih:'i',e:'ae',ae:'e',ah:'uh',uh:'ah',o:'aw',aw:'o',u:'uu',uu:'u',er:'schwa',schwa:'er',ei:'ai',ai:'ei',oi:'ai',au:'ou',ou:'au',ia:'ea',ea:'ia',ua:'uu',p:'b',b:'p',t:'d',d:'t',k:'g',g:'k',f:'v',v:'f',theta:'s',dh:'z',s:'sh',z:'s',sh:'s',zh:'sh',ch:'jh',jh:'ch',m:'n',n:'ng',ng:'n',l:'r',r:'l',j:'w',w:'j',h:'f',ts:'s',dz:'z',tr:'ch',dr:'jh'};
const vowelCues={
 i:[t('嘴角轻轻向两边拉'),t('舌头前部抬高，别碰上腭'),t('不要咬紧牙齿；和 /ɪ/ 比时，舌位也不同。')],
 ih:[t('嘴巴小开，嘴角放松'),t('舌头前部稍抬起，比 /iː/ 低'),t('不是把 /iː/ 读短就够了。')],
 e:[t('嘴巴自然打开一点'),t('舌头前部抬到中间偏上'),t('和 /æ/ 比，嘴巴开得小一些。')],
 ae:[t('下巴放低，嘴角自然展开'),t('舌头前部放低'),t('别读成 /e/；嘴巴要更开。')],
 ah:[t('嘴巴打开，嘴唇放松'),t('舌头放低，偏后一点'),t('长音不等于重音，不用使劲喊。')],
 o:[t('嘴巴打开，嘴唇稍圆'),t('舌头后部放低'),t('和 /ɔː/ 比，舌位更低、嘴巴更开。')],
 aw:[t('嘴唇围成圆口'),t('舌头后部抬到中间'),t('不要只延长 /ɒ/，还要调整舌位。')],
 uu:[t('嘴巴小开，轻轻圆唇'),t('舌头后部抬高，但别绷紧'),t('和 /uː/ 比，更放松、舌位稍低。')],
 u:[t('嘴唇圆起来，轻轻向前'),t('舌头后部抬高'),t('圆唇不等于用力噘嘴；不要挤紧。')],
 uh:[t('嘴唇放松，下巴打开一点'),t('舌头中部偏低'),t('别读成圆唇的 /ɒ/。')],
 er:[t('嘴唇放松，保持小开口'),t('舌头保持中间位置'),t('这里示范英式非卷舌音，不要卷舌。')],
 schwa:[t('嘴巴放松，轻轻打开'),t('舌头停在中间，别用力'),t('常在非重读音节里出现，短而轻。')],
};
const consonantCues={
 p:[t('双唇先合上，再打开'),t('舌头放松')],b:[t('双唇先合上，再打开'),t('舌头放松')],
 t:[t('嘴巴微开'),t('舌尖先碰上牙齿后的小凸起，再松开')],d:[t('嘴巴微开'),t('舌尖先碰上牙齿后的小凸起，再松开')],
 k:[t('嘴巴打开一点'),t('舌头后部先顶住，再松开')],g:[t('嘴巴打开一点'),t('舌头后部先顶住，再松开')],
 f:[t('上门牙轻碰下嘴唇'),t('舌头放松')],v:[t('上门牙轻碰下嘴唇'),t('舌头放松')],
 theta:[t('嘴巴微开，不要咬紧'),t('舌尖轻放上下牙齿之间')],dh:[t('嘴巴微开，不要咬紧'),t('舌尖轻放上下牙齿之间')],
 s:[t('嘴角放松，牙齿靠近但不咬紧'),t('舌尖靠近上牙齿后面，留一道小缝')],z:[t('嘴角放松，牙齿靠近但不咬紧'),t('舌尖靠近上牙齿后面，留一道小缝')],
 sh:[t('嘴唇稍微圆起来'),t('舌头前部靠近上腭，位置比 /s/ 后')],zh:[t('嘴唇稍微圆起来'),t('舌头前部靠近上腭，位置比 /z/ 后')],
 ch:[t('嘴唇稍圆'),t('舌头前部先顶住，再慢慢松开')],jh:[t('嘴唇稍圆'),t('舌头前部先顶住，再慢慢松开')],
 m:[t('双唇合上'),t('舌头放松，气从鼻子出去')],n:[t('嘴唇微开'),t('舌尖碰上牙齿后面，气从鼻子出去')],ng:[t('嘴唇微开'),t('舌头后部抬起堵住口腔，气从鼻子出去')],
 l:[t('嘴唇放松'),t('舌尖碰上牙齿后面，气从舌头两侧走')],r:[t('嘴唇可以稍圆'),t('舌头向后收，不碰上腭、不弹舌')],
 j:[t('嘴唇放松'),t('舌头前部抬起，快速滑向下一个元音')],w:[t('嘴唇先圆起来，再舒展开'),t('舌头后部抬起，快速滑向下一个元音')],
 h:[t('嘴巴自然打开'),t('舌头准备好下一个元音的位置')],
};
export function lessonFor(id){
  const p=PHONEMES[id];if(!p)return null;
  const voiced=(p.poses[0].Voice||0)>.1;
  let cues;
  if(vowelCues[id])cues=vowelCues[id];
  else if(p.category==='diphthong')cues=[t('嘴唇从第一个口型滑到第二个'),t('舌头跟着平稳移动，中间不停顿'),t('不要拆成两个分开的音；重点看滑动过程。')];
  else if(p.components)cues=[t('先做好 /')+PHONEMES[p.components[0]].ipa+t('/ 的嘴型'),t('接着过渡到 /')+PHONEMES[p.components[1]].ipa+'/',t('两个辅音连着读，中间不要加“呃”。')];
  else cues=[...consonantCues[id],t('别在辅音后面加“呃”；保持轻松，不憋气。')];
  const air=p.category==='nasal'?t('气从鼻子出去'):p.category==='plosive'?t('先挡住气，再一下放开'):p.category==='affricate'||p.category==='cluster'?t('先挡住，再慢慢放开'):t('让气息平稳地出去');
  return {id,ipa:p.ipa,word:p.word,mouth:cues[0],tongue:cues[1],reminder:cues[2],air,voice:voiced?t('轻摸喉咙，感觉振动'):t('轻轻送气，不主动振动声带'),voiced,contrast:CONTRASTS[id]};
}
