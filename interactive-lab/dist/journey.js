import {t} from './i18n.js';
import {LESSON_SERIES} from './curriculum.js';
export const CHAPTERS=[t('情境听读'),t('看嘴巴的秘密'),t('读出一个词'),t('听音选意思'),t('把词连起来'),t('说出完整句'),t('轮到你来讲'),t('学习回顾')];
export const SCENES={
 dog:{icon:'🐕',place:t('公园里的新朋友'),question:t('你在公园遇到一只大狗。怎样用英语介绍它？'),answer:t('一只大狗'),choices:[t('一只黑猫'),t('一只大狗'),t('一条红鱼')],transfer:t('换一个玩具，试着用 This is a… 介绍它。')},
 cat:{icon:'🐈‍⬛',place:t('窗边的小客人'),question:t('窗边来了一只黑猫。你能把它介绍给朋友吗？'),answer:t('一只黑猫'),choices:[t('一只黑猫'),t('一只大狗'),t('一杯牛奶')],transfer:t('指一指身边的玩具，用 This is a… 介绍它。')},
 fish:{icon:'<svg viewBox="0 0 120 90" width="100" height="90" aria-hidden="true"><path d="M79 45 112 16v58Z" fill="#c95641"/><ellipse cx="53" cy="45" rx="39" ry="28" fill="#df7058"/><path d="m44 19 16-13 12 18M45 69l15 15 12-18" fill="#b74634"/><path d="m58 37 16 8-16 10" fill="#efab83"/><circle cx="32" cy="38" r="5" fill="#fff"/><circle cx="31" cy="38" r="2.5" fill="#253d32"/></svg>',place:t('水里的红色朋友'),question:t('鱼缸里有一条红鱼。一起说说你看到了什么。'),answer:t('一条红鱼'),choices:[t('冷牛奶'),t('一条红鱼'),t('一只黑猫')],transfer:t('想一想另一种颜色，和老师一起替换 red 再说一遍。')},
 milk:{icon:'🥛',place:t('早餐时间到了'),question:t('早餐时，你想告诉家人：我喜欢冷牛奶。'),answer:t('我喜欢冷牛奶'),choices:[t('这是一条鱼'),t('我喜欢冷牛奶'),t('这是一只大狗')],transfer:t('想一想你喜欢的食物，和老师一起用 I like… 说出来。')},
 rabbit:{icon:'🐇',place:t('草地上的白兔'),question:t('草地上来了一只白兔。怎样介绍这位新朋友？'),answer:t('一只白兔'),choices:[t('一只白兔'),t('一只黄鸭'),t('一匹棕马')],transfer:t('找一件白色的物品，和老师一起用 white 描述它。')},
 bird:{icon:'🐦',place:t('树枝上的小鸟'),question:t('树枝上停着一只小鸟。把你看到的告诉朋友。'),answer:t('一只小鸟'),choices:[t('一只大狮子'),t('一只小鸟'),t('一只白兔')],transfer:t('选择一个小玩具，和老师一起用 little 描述它。')},
 duck:{icon:'<svg viewBox="0 0 120 90" width="100" height="90" aria-hidden="true"><path d="M13 72q47 12 94 0" fill="none" stroke="#91bcca" stroke-width="5" stroke-linecap="round"/><path d="M19 46q10 11 27 3h44v12c-3 20-60 21-64-2Z" fill="#efc94c"/><circle cx="80" cy="35" r="22" fill="#f6d65e"/><path d="m96 34 19 6-19 7Z" fill="#dc823c"/><circle cx="85" cy="30" r="3" fill="#253d32"/><path d="M43 55q18-9 28 2-15 16-28-2" fill="#dbb037"/></svg>',place:t('池塘边的黄鸭'),question:t('池塘边有一只黄鸭。你能介绍它吗？'),answer:t('一只黄鸭'),choices:[t('一条红鱼'),t('一只黑猫'),t('一只黄鸭')],transfer:t('找找身边的黄色物品，和老师一起替换 yellow 后面的词。')},
 horse:{icon:'🐎',place:t('牧场里的棕马'),question:t('牧场里有一匹棕马。说说它是什么颜色。'),answer:t('一匹棕马'),choices:[t('一只黄鸭'),t('一匹棕马'),t('一只白兔')],transfer:t('想象一匹白马，试着把 brown 换成 white。')},
 lion:{icon:'🦁',place:t('动物园的大狮子'),question:t('动物园里有一只大狮子。怎样把它介绍给家人？'),answer:t('一只大狮子'),choices:[t('一只大狮子'),t('一只小鸟'),t('一只可爱的熊猫')],transfer:t('比较 big dog 和 big lion，说说哪些声音变了。')},
 panda:{icon:'🐼',place:t('竹林里的熊猫'),question:t('你看到一只可爱的熊猫。怎样用英语赞美它？'),answer:t('一只可爱的熊猫'),choices:[t('一只黑猫'),t('一只可爱的熊猫'),t('一匹棕马')],transfer:t('选择一种喜欢的动物，和老师一起用 cute 描述它。')}
};
for(const series of LESSON_SERIES) {
 if(series.scene) SCENES[series.id]={icon:SCENES[series.id]?.icon||'📘',...series.scene};
}
const KEY='phonetic-journey-v1';
export function readProgress(storage){
 try{
  const data=JSON.parse((storage||localStorage).getItem(KEY)||'{}');const safe={};
  for(const {id} of LESSON_SERIES){
   const value=data?.[id];if(!value||!Array.isArray(value.done))continue;
   const done=[...new Set(value.done.filter(n=>Number.isInteger(n)&&n>=0&&n<7))].sort((a,b)=>a-b);
   // Only a consecutive completed path unlocks later chapters.
   let unlocked=0;while(done.includes(unlocked))unlocked++;
   safe[id]={done:done.filter(n=>n<unlocked),step:Number.isInteger(value.step)?Math.max(0,Math.min(unlocked,value.step)):0};
   if(typeof value.sentenceHeardOn==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.sentenceHeardOn))safe[id].sentenceHeardOn=value.sentenceHeardOn;
   const check=value.selfCheck;
   if(typeof check?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(check.date)&&Array.isArray(check.checks)&&check.checks.length===2&&check.checks.every(v=>typeof v==='boolean'))safe[id].selfCheck={date:check.date,checks:check.checks};
  }
  return safe;
 }catch{return {};}
}
export function writeProgress(progress,storage){try{(storage||localStorage).setItem(KEY,JSON.stringify(progress));return true;}catch{return false;}}
export function lessonForChapter(series,index){return series.lessonIds[({0:3,1:0,2:1,3:3,4:2,5:3,6:3,7:3})[index]];}
