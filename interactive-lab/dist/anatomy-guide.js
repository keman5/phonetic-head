import {t} from './i18n.js';
// Child-facing names describe the job first; colours are a teaching key, not
// real tissue colours. World-space anchors are updated for moving organs.
export const ANATOMY_INTRO = t('先找嘴巴的顶棚：前面是硬腭，后面是会动的软腭。点一个名称，一次认识一个部位。');
export const ANATOMY_GUIDES = [
  {id:'nasal',label:t('鼻腔'),nickname:t('鼻子的里面'),color:'#a9cfe2',point:[0,.026,.053],focus:null,sound:'m',
    description:t('鼻腔通道是鼻子里面的空腔，不是一块蓝色的器官。发 /m/ 时，气息从鼻子出去。'),activity:t('轻轻闭嘴发 /m/，看看箭头往哪里走。')},
  {id:'hard-palate',label:t('硬腭'),nickname:t('前面的硬顶棚'),color:'#f1bd91',point:[0,.004,.065],focus:null,names:['Hard palate'],sound:'t',
    description:t('硬腭在上牙齿后方，是嘴巴顶棚硬硬的前半部。它不随发音上下摆动。'),activity:t('轻轻把舌尖放在上门牙后的小凸起，试一试 /t/。')},
  {id:'velum',label:t('软腭'),nickname:t('后面的活动小门'),color:'#ae95e8',point:[0,.002,.032],focus:'velum',names:['Soft palate','Uvula of palate'],sound:'n',contrast:'ah',
    description:t('软腭接在硬腭后面，可以抬起、放下，像一扇控制鼻腔通路的小门。后缘垂下的小尾巴叫悬雍垂。'),activity:t('比较 /ɑː/ 和 /n/：看小门的位置，再看气息从哪里出去。')},
  {id:'tongue',label:t('舌头'),color:'#f47791',point:[0,-.027,.060],focus:'tongue',
    nickname:t('会变形的小帮手'),names:['Tongue'],sound:'l',description:t('这是舌头的侧面剖切图：前端是舌尖，上面是舌面，后下方较厚的是舌根。舌根连接在口腔底部，不是整块舌头都伸在嘴外；发音时不同部位分别运动。'),activity:t('试试 /l/，找一找抬起来的舌尖。')},
  {id:'voice',label:t('声带'),nickname:t('喉咙里的发声器'),color:'#d69b36',point:[0,-.073,.015],focus:'voice',sound:'z',contrast:'s',
    description:t('金色圈圈标出喉部，声带在这里。声带是两条小褶皱，不是整个金色区域；下方有放大示意。'),activity:t('轻轻摸喉咙，比较 /s/ 和 /z/。不要用力按。')},
  {id:'airway',label:t('气管'),nickname:t('空气经过的管道'),color:'#64cabc',point:[0,-.100,.010],focus:null,names:['Trachea'],sound:'h',
    description:t('绿色管道向下连着肺。发声时，呼出的气息经过喉部，再从嘴巴或鼻子出去。蓝色小点和箭头不是器官，只表示气流方向。'),activity:t('轻轻呼出一口气，跟着箭头从下往上看。')},
];
