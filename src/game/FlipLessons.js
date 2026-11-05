import { FLIP_TRICKS, DOUBLE_FLIP_TRICKS } from './TrickCatalog.js';
import { flipTurns } from '../character/TrickMotion.js';
import { readBindings, keyLabel, padLabel } from '../input/ControlBindings.js';

const DIRECTIONS = {
  left: ['←','Left','A',-1,0], right: ['→','Right','D',1,0],
  up: ['↑','Up','W',0,-1], down: ['↓','Down','S',0,1],
  upLeft: ['↖','Up-left','W + A',-1,-1], upRight: ['↗','Up-right','W + D',1,-1],
  downLeft: ['↙','Down-left','S + A',-1,1], downRight: ['↘','Down-right','S + D',1,1],
};
const TIPS = {
  left:'Watch the deck roll once, then catch it with both feet.',
  right:'The deck rolls the opposite way to a kickflip. Keep your landing straight.',
  up:'Watch the board wrap end over end before the catch.',
  down:'The board turns 180° underneath you. Keep the rider facing the landing.',
  upLeft:'A quick nose-up accent combines a kickflip with a half shove-it.',
  upRight:'Hold the diagonal just for the tap. Release it to avoid extra air rotation.',
  downLeft:'The board combines one kickflip with a 180° shove-it.',
  downRight:'The board combines one heelflip with a 180° shove-it.',
};
export const FLIP_LESSONS = Object.freeze(Object.entries(DIRECTIONS).map(([direction,[arrow,label,keys,x,y]])=>{
  const trick=FLIP_TRICKS[direction];
  const id=trick.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  return Object.freeze({id,direction,arrow,label,keys,x,y,trick,tip:TIPS[direction],
    upgrade:DOUBLE_FLIP_TRICKS[trick.name]?.name,
    video:`/media/flip-school/${id}.webm`,poster:`/media/flip-school/${id}.jpg`});
}));
export const ADVANCED_FLIP_LESSONS = Object.freeze(['downLeft','downRight','left','right'].map(direction=>{
  const base=FLIP_LESSONS.find(lesson=>lesson.direction===direction),trick=DOUBLE_FLIP_TRICKS[base.trick.name];
  const id=trick.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  return Object.freeze({...base,id,trick,baseTrick:base.trick,taps:2,
    upgrade:DOUBLE_FLIP_TRICKS[trick.name]?.name||null,
    tip:`Start a ${base.trick.name}, release the flip button, then tap it again early with the same direction. Release the direction after the second tap and let the board finish.`,
    video:`/media/flip-school/${id}.webm`,poster:`/media/flip-school/${id}.jpg`});
}));
export const ALL_FLIP_LESSONS = Object.freeze([...FLIP_LESSONS,...ADVANCED_FLIP_LESSONS]);

// One timeline drives the recorded demonstration and the live input overlay.
// Seconds are clip time; playback speed scales the video and overlay together.
export const FLIP_LESSON_TIMING = Object.freeze({charge:.35,pop:1.05,tap:1.16,release:1.30,firstRelease:1.23,secondTap:1.31,secondRelease:1.39,land:1.95,duration:3.2});
/** The list and detailed steps describe the same discrete button sequence. */
export function flipLessonInput(lesson,direction=`${lesson.arrow} ${lesson.label}`,flip='flip') {
  return `${direction} + ${flip}${lesson.taps===2?' → release → '+flip:''}`;
}
export function flipLessonFrame(lesson,time) {
  const t=Math.max(0,Number(time)||0),k=FLIP_LESSON_TIMING;
  const airborne=t>=k.pop&&t<k.land;
  let flipState=null;
  if(t>=k.tap&&airborne){
    if(lesson.taps===2){
      const startProgress=(k.secondTap-k.tap)/lesson.baseTrick.duration;
      const progress=t<k.secondTap?(t-k.tap)/lesson.baseTrick.duration:startProgress+(t-k.secondTap)/lesson.trick.duration;
      if(progress<1)flipState=t<k.secondTap?{...lesson.baseTrick,progress}:{...lesson.trick,progress,
        rotationStartProgress:startProgress,rotationFrom:flipTurns({...lesson.baseTrick,progress:startProgress})};
    }else if(t<k.tap+lesson.trick.duration)flipState={...lesson.trick,progress:(t-k.tap)/lesson.trick.duration};
  }
  const secondTap=lesson.taps===2&&t>=k.secondTap&&t<k.secondRelease;
  return {
    step:t<k.pop?0:t<k.tap?1:t<k.land?2:3,
    ollie:t>=k.charge&&t<k.pop,
    flip:lesson.taps===2?((t>=k.tap&&t<k.firstRelease)||secondTap):(t>=k.tap&&t<k.release),
    direction:t>=k.tap&&t<(lesson.taps===2?k.secondRelease:k.release),
    tapNumber:lesson.taps===2&&t>=k.secondTap?2:1,
    airborne,
    flipState,
    airProgress:airborne?(t-k.pop)/(k.land-k.pop):0,
    crouch:t<k.pop?Math.max(0,Math.min(1,(t-k.charge)/.45)):0,
    landing:t>=k.land&&t<k.land+.3,
  };
}

export function flipLessonSteps(lesson,mode='xbox',bindings=readBindings()) {
  const ollie=mode==='keyboard'?keyLabel(bindings.ollie.keyboard[0]):padLabel(bindings.ollie.gamepad,mode);
  const flip=mode==='keyboard'?keyLabel(bindings.flip.keyboard[0]):padLabel(bindings.flip.gamepad,mode);
  const keys=[...(lesson.y<0?['up']:lesson.y>0?['down']:[]),...(lesson.x<0?['left']:lesson.x>0?['right']:[])].map(action=>keyLabel(bindings[action].keyboard[0])).join(' + ');
  const direction=mode==='keyboard'?keys:`${lesson.arrow} ${lesson.label}`;
  return [
    {title:'Charge',input:`Hold ${ollie}`,detail:'Build your ollie before takeoff.'},
    {title:'Pop',input:`Release ${ollie}`,detail:'Get the board into the air.'},
    {title:lesson.taps===2?'Double tap':'Flick',input:flipLessonInput(lesson,direction,flip),detail:lesson.taps===2?'Keep the same direction for both taps. Release the flip button between taps. Tap again early, then release the direction.':'Tap together, then release the direction.'},
    {title:'Land',input:'Release · land straight',detail:'Let the flip finish and catch the board.'},
  ];
}
