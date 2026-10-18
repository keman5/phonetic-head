// Domestic 48-symbol teaching collection: British-style 44 plus four clusters.
export const CHANNELS = ['JawOpen','TipForward','FrontHigh','BackSeal','VelumRaise','LipClose','LipSpread','Voice','JawForward','LipRound','LipProtrude','LipBite','TipAlveolar','TongueRetroflex','TongueCenter','TongueLow','BackHigh','TongueGroove','TongueLateral','VelumLower','GlottisClose','VocalTension','GlottisOpen','BreathPressure'];
export const CATEGORIES = {vowel:'单元音',diphthong:'双元音',plosive:'爆破音',fricative:'擦音',affricate:'塞擦音',nasal:'鼻音',approximant:'近音 / 边音',cluster:'复合辅音'};
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const oral={VelumRaise:.8,JawOpen:.3};
const voiced={Voice:.75,GlottisClose:.45,GlottisOpen:0,VocalTension:.3,BreathPressure:.35};
const unvoiced={Voice:0,GlottisClose:0,GlottisOpen:.75,VocalTension:0,BreathPressure:.75};
const vowel=(p)=>({...oral,...voiced,...p});
export const PHONEMES={};
function add(id,ipa,category,word,copy,poses,focus=['tongue','lips','velum','voice']){
  PHONEMES[id]={id,ipa,category,word,copy,focus,poses,duration:category==='diphthong'?.9:.6};
}
const vowels=[
 ['i','iː','see','舌前部高位，嘴唇展开。',{JawOpen:.22,FrontHigh:1,LipSpread:.8}],
 ['ih','ɪ','sit','舌前部略低于长音，口唇放松。',{JawOpen:.3,FrontHigh:.65,LipSpread:.35}],
 ['e','e','bed','舌前部中高，下颌适度打开。',{JawOpen:.45,FrontHigh:.4,LipSpread:.35}],
 ['ae','æ','cat','下颌打开，舌前部保持低位。',{JawOpen:.85,TongueLow:.7,LipSpread:.4}],
 ['ah','ɑː','father','舌体后低，口腔充分打开。',{JawOpen:.95,TongueLow:.9,BackHigh:.15}],
 ['o','ɒ','hot','舌后部低位，嘴唇轻圆。',{JawOpen:.8,TongueLow:.6,LipRound:.45}],
 ['aw','ɔː','law','舌后部抬至中位，圆唇。',{JawOpen:.55,BackHigh:.5,LipRound:.7,LipProtrude:.3}],
 ['uu','ʊ','book','舌后部较高，嘴唇放松微圆。',{JawOpen:.3,BackHigh:.65,LipRound:.5}],
 ['u','uː','food','舌后部高位，圆唇前突。',{JawOpen:.2,BackHigh:1,LipRound:.9,LipProtrude:.7}],
 ['uh','ʌ','cup','舌中央偏低，嘴唇放松。',{JawOpen:.6,TongueLow:.5,TongueCenter:.2}],
 ['er','ɜː','bird','舌中央保持中位，采用非卷舌英式长元音。',{JawOpen:.4,TongueCenter:.65}],
 ['schwa','ə','about','舌体居中放松，短而轻。',{JawOpen:.3,TongueCenter:.3}],
];
for(const [id,ipa,word,copy,p] of vowels)add(id,ipa,'vowel',word,copy,[vowel(p)]);
for(const [id,ipa,word,a,b] of [
 ['ei','eɪ','day','e','ih'],['ai','aɪ','my','ah','ih'],['oi','ɔɪ','boy','aw','ih'],
 ['au','aʊ','now','ah','uu'],['ou','əʊ','go','schwa','uu'],['ia','ɪə','near','ih','schwa'],
 ['ea','eə','hair','e','schwa'],['ua','ʊə','tour','uu','schwa']
])add(id,ipa,'diphthong',word,`从 /${PHONEMES[a].ipa}/ 连续滑向 /${PHONEMES[b].ipa}/，不中断发声。`,[PHONEMES[a].poses[0],PHONEMES[b].poses[0]]);
function pair(ids,ipas,category,words,shape,release,copy,focus){
  ids.forEach((id,i)=>{
    const voice=i?voiced:unvoiced;
    const poses=[{...oral,...shape,...voice}];
    if(release)poses.push({...oral,...release,...voice});
    add(id,ipas[i],category,words[i],copy+(i?'声带参与发声。':'声带不振动。'),poses,focus);
  });
}
pair(['p','b'],['p','b'],'plosive',['pen','bad'],{LipClose:1,JawOpen:0},{LipClose:0,JawOpen:.4},'双唇先闭合，再释放气流。',['lips','jaw','velum','voice']);
pair(['t','d'],['t','d'],'plosive',['tea','day'],{TipAlveolar:1},{TipAlveolar:.05},'舌尖接触齿龈，随后解除闭塞。');
pair(['k','g'],['k','g'],'plosive',['cat','go'],{BackSeal:1,JawOpen:.6},{BackSeal:0,JawOpen:.6},'舌后部闭塞，再打开后部通道。');
pair(['f','v'],['f','v'],'fricative',['fan','van'],{LipBite:.9,JawOpen:.2},null,'下唇轻触上门齿，保留狭窄气流通道。',['lips','voice','velum']);
pair(['theta','dh'],['θ','ð'],'fricative',['thin','this'],{TipForward:.9,JawOpen:.5,JawForward:.12},null,'舌尖轻放齿间，持续送气。');
pair(['s','z'],['s','z'],'fricative',['see','zoo'],{TipAlveolar:.65,TongueGroove:.9,JawOpen:.2},null,'舌尖靠近齿龈，舌中央形成窄沟。');
pair(['sh','zh'],['ʃ','ʒ'],'fricative',['ship','vision'],{TipAlveolar:.35,TongueCenter:.6,TongueGroove:.65,LipRound:.4},null,'舌前部接近齿龈后方，嘴唇稍圆。');
add('h','h','fricative','hat','声门开放，气息经口腔送出。',[{...oral,...unvoiced,GlottisOpen:1}],['voice','velum']);
pair(['ch','jh'],['tʃ','dʒ'],'affricate',['chair','jam'],{TipAlveolar:1,TongueCenter:.4},{TipAlveolar:.35,TongueCenter:.6,TongueGroove:.65,LipRound:.4},'先在齿龈后闭塞，再缓慢释放为摩擦。');
for(const [id,ipa,word,p] of [['m','m','man',{LipClose:1,JawOpen:0}],['n','n','no',{TipAlveolar:1}],['ng','ŋ','sing',{BackSeal:1}]])
 add(id,ipa,'nasal',word,'保持口腔闭塞，软腭下降，让气流进入鼻腔。',[{...oral,...voiced,...p,VelumRaise:0,VelumLower:1}],['tongue','lips','velum','voice']);
for(const [id,ipa,word,copy,p] of [
 ['l','l','leg','舌尖接触齿龈，气息从舌两侧通过。',{TipAlveolar:.9,TongueLateral:1}],
 ['r','r','red','演示英语近音 [ɹ] 的舌尖后收构形，不弹舌。',{TongueRetroflex:.7,TongueCenter:.25,LipRound:.25}],
 ['j','j','yes','舌前部抬高，快速滑向后续元音。',{FrontHigh:.85,LipSpread:.4}],
 ['w','w','wet','舌后部抬高，圆唇前突并滑向后续元音。',{BackHigh:.8,LipRound:.85,LipProtrude:.7}]
])add(id,ipa,'approximant',word,copy,[{...oral,...voiced,...p}]);
for(const [id,a,b,word] of [['ts','t','s','cats'],['dz','d','z','beds'],['tr','t','r','tree'],['dr','d','r','dream']]){
 add(id,id,'cluster',word,`由 /${PHONEMES[a].ipa}/ 的闭塞连续过渡到 /${PHONEMES[b].ipa}/，作为教学组合单列。`,[PHONEMES[a].poses[0],PHONEMES[b].poses[0]]);
 PHONEMES[id].components=[a,b];
}
export const LETTERS=Object.fromEntries([
 ['A',['ei']],['B',['b','i']],['C',['s','i']],['D',['d','i']],['E',['i']],['F',['e','f']],['G',['jh','i']],
 ['H',['ei','ch']],['I',['ai']],['J',['jh','ei']],['K',['k','ei']],['L',['e','l']],['M',['e','m']],['N',['e','n']],
 ['O',['ou']],['P',['p','i']],['Q',['k','j','u']],['R',['ah']],['S',['e','s']],['T',['t','i']],['U',['j','u']],
 ['V',['v','i']],['W',['d','uh','b','schwa','l','j','u']],['X',['e','k','s']],['Y',['w','ai']],['Z',['z','e','d']]
].map(([id,sequence])=>[id,{id,sequence,ipa:sequence.map(p=>PHONEMES[p].ipa).join('')} ]));
export function blend(a,b,t){return Object.fromEntries(CHANNELS.map(k=>[k,(a[k]||0)*(1-t)+(b[k]||0)*t]));}
export function phonemePose(id,t){
 const p=PHONEMES[id];if(!p)throw new RangeError('Unknown phoneme: '+id);
 const closure=['plosive','affricate','cluster'].includes(p.category);
 const mix=p.poses.length===1?0:ease(closure?(t-.52)/.32:t);
 const weights=blend(p.poses[0],p.poses.at(-1),mix);
 const blocked=closure?1-mix:0;
 return {weights,air:(weights.BreathPressure||0)*(1-blocked),nasal:weights.VelumLower||0};
}
export function makeTimeline(sequence){
 if(!Array.isArray(sequence)||!sequence.length)throw new TypeError('Empty phoneme sequence');
 let duration=0;const clips=sequence.map(id=>{if(!PHONEMES[id])throw new RangeError('Unknown phoneme: '+id);const start=duration;duration+=PHONEMES[id].duration;return {id,start,end:duration};});
 return {clips,duration};
}
export function timelinePose(timeline,seconds){
 const {clips,duration}=timeline;const s=Math.max(0,Math.min(duration,seconds));
 const progress=c=>Math.max(0,Math.min(1,(s-c.start)/(c.end-c.start)));
 const sample=c=>phonemePose(c.id,progress(c));
 let index=clips.findIndex(c=>s<c.end);if(index<0)index=clips.length-1;
 let result=sample(clips[index]);
 // A symmetric 90 ms window lets the next articulator prepare before the boundary.
 for(let i=1;i<clips.length;i++)if(Math.abs(s-clips[i].start)<.045){
  const a=sample(clips[i-1]),b=sample(clips[i]),t=ease((s-clips[i].start+.045)/.09);
  const air=a.air*(1-t)+b.air*t;
  // Route the remaining flow, not the velum blend: a closing nasal cannot leak through a sealed mouth.
  const nasal=air>0?(a.air*a.nasal*(1-t)+b.air*b.nasal*t)/air:0;
  result={weights:blend(a.weights,b.weights,t),air,nasal};break;
 }
 const envelope=ease(s/.08)*ease((duration-s)/.10);
 result.weights=blend({},result.weights,envelope);result.air*=envelope;
 const phonemeProgress=progress(clips[index]);
 return {...result,phoneme:clips[index].id,nextPhoneme:clips[index+1]?.id||null,letter:clips[index].letter,phonemeProgress,voiced:result.weights.Voice>.1,step:phonemeProgress<.3?0:phonemeProgress<.62?1:2,t:s/duration};
}
