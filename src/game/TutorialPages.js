import { FLIP_TRICKS, DOUBLE_FLIP_TRICKS, GRAB_TRICKS, DOUBLE_GRAB_TRICKS,
  GRIND_TRICKS, DOUBLE_GRIND_TRICKS, FLATLAND_TRICKS } from './TrickCatalog.js';
import { readBindings, keyLabel, padLabel } from '../input/ControlBindings.js';

export function xboxIcons(value) {
  return String(value).replace(/\b(LB|RB|LT|RT|A|B|X|Y|View|Select|Start|Menu|D-pad)\b/g, token => {
    const cls=/^[ABXY]$/.test(token)?'xbox-'+token.toLowerCase():'xbox-mod';
    return '<span class="xbox-input '+cls+'" aria-label="Xbox '+token+'">'+token+'</span>';
  });
}
const attribute=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const table=(head,rows)=>`<table role="table"><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr role="row">${row.map((v,i)=>`<td role="cell" data-label="${attribute(head[i])}"><span class="tutorial-value">${head[i]?.startsWith('Xbox')?xboxIcons(v):v}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
export function tutorialPages(bindings=readBindings()) {
  const key=action=>bindings[action].keyboard.map(keyLabel).join(' / ');
  const pad=action=>padLabel(bindings[action].gamepad);
  const directions={none:'Neutral',left:`${key('left')} / Left`,right:`${key('right')} / Right`,up:`${key('up')} / Up`,down:`${key('down')} / Down`,
    upLeft:`${key('up')}+${key('left')} / Up-left`,upRight:`${key('up')}+${key('right')} / Up-right`,
    downLeft:`${key('down')}+${key('left')} / Down-left`,downRight:`${key('down')}+${key('right')} / Down-right`};
  const keyboardDirections=['up','left','down','right'].map(key).join(' ');
  const markerPad=(direction,direct)=>{
    const chord=['spinLeft','spinRight',direction];
    const inputs=[];
    if(bindings[direct].gamepad!==null)inputs.push(pad(direct));
    if(chord.every(action=>bindings[action].gamepad!==null))inputs.push(chord.map(pad).join(' + '));
    return inputs.join(' or ')||'Unassigned · bind in Settings';
  };
  return [
    {title:'Build your first line',subtitle:'90 seconds. Build a line. Land your combos.',html:table(['Action','Keyboard','Xbox'],[
      ['Steer / trick direction',keyboardDirections,`Left stick / ${['up','down','left','right'].map(pad).join(' / ')}`],['Ollie',`Hold ${key('ollie')}, then release`,`Hold ${pad('ollie')}, then release`],
      ['Flip / Grab / Grind',['flip','grab','grind'].map(key).join(' / '),['flip','grab','grind'].map(pad).join(' / ')],['Air rotation',['spinLeft','spinRight'].map(key).join(' / '),['spinLeft','spinRight'].map(pad).join(' / ')],
      ['Vert exit / switch stance',['vertExit','switchStance'].map(key).join(' / '),['vertExit','switchStance'].map(pad).join(' / ')],['Cycle cameras',key('cameraMode'),pad('cameraMode')],
      ['Skip song','Backspace','View / Select'],['Pause','Esc','Menu / Start'],
      ['Practice marker: save / return',['practiceMark','practiceReturn'].map(key).join(' / '),`${markerPad('up','practiceMark')} / ${markerPad('down','practiceReturn')}`],
    ])+`<p>These are your current saved controls. ${key('up')} = Up, ${key('down')} = Down, ${key('left')} = Left, ${key('right')} = Right. Combine vertical and horizontal directions for diagonals. Xbox uses the same direction on the left stick or your direction buttons. Start Game is 90 seconds. Options → Practice has no time limit.</p>`},
    {title:'Flip tricks',subtitle:`Hold direction + ${key('flip')} / Xbox ${pad('flip')}. Tap again early to upgrade.`,html:table(['Direction: keyboard / stick','One tap','Two taps','Three taps'],
      Object.entries(FLIP_TRICKS).filter(([d])=>d!=='none').map(([d,t])=>{const next=DOUBLE_FLIP_TRICKS[t.name];return[directions[d],t.name,next?.name||'—',DOUBLE_FLIP_TRICKS[next?.name]?.name||'—'];}))+
      '<p>Neutral = Kickflip. Extra taps must arrive before the flip finishes; triple flips need more airtime. Release the trick button between taps.</p>'},
    {title:'Grab tricks',subtitle:`Hold direction + ${key('grab')} / Xbox ${pad('grab')}. Double-tap, then hold for the advanced grab.`,html:table(['Direction: keyboard / stick','Press + hold','Double-tap + hold'],
      Object.entries(GRAB_TRICKS).filter(([d])=>d!=='none').map(([d,t])=>[directions[d],t.name,DOUBLE_GRAB_TRICKS[t.name].name]))+
      '<p>Double-tap within 0.38 seconds; hold the second press. Release to let go. Neutral = Indy.</p>'},
    {title:'Grinds & balance',subtitle:`Approach a rail from the air. Hold direction + ${key('grind')} / Xbox ${pad('grind')}.`,html:table(['Direction: keyboard / stick','Press + hold','Double-tap + hold'],
      Object.entries(GRIND_TRICKS).map(([d,t])=>[directions[d],t.name,DOUBLE_GRIND_TRICKS[t.name].name]))+
      `<p>Boardslide: ${key('brake')} + ${key('grind')} / ${pad('vertExit')} + ${pad('grind')}. Double-tap within 0.38 seconds for variants. Balance against the marker: if it leans left, press ${key('right')} / stick right; if it leans right, press ${key('left')} / stick left. Reaching either end causes a fall.</p>`},
    {title:'Manuals & flatland',subtitle:`Manual: ${key('up')} then ${key('down')} / stick Up then Down. Nose Manual: ${key('down')} then ${key('up')} / Down then Up.`,html:table(['Trick','Keyboard sequence','Xbox sequence'],
      Object.entries(FLATLAND_TRICKS).map(([sequence,t])=>[t.name,sequence.split('+').map(key).join(' then '),sequence.split('+').map(pad).join(' then ')]))+
      `<p>Start a manual first, then enter the button pair quickly. If the vertical balance marker moves up, press ${key('down')} / stick down; if it moves down, press ${key('up')} / stick up. Manuals connect landed tricks into a longer combo.</p>`},
    {title:'Walls, cameras & your run',subtitle:'Land clean. Keep your combo going.',html:table(['Action','Keyboard','Xbox'],[
      ['Wall Ride',`Hold ${key('grind')} against a wall in the air`,`Hold ${pad('grind')} against a wall in the air`],['Wall Plant',`${key('ollie')} when hitting a wall in the air`,`${pad('ollie')} when hitting a wall in the air`],
      ['Wallie',`${key('ollie')} during a Wall Ride`,`${pad('ollie')} during a Wall Ride`],['Follow / Follow Test / Follow Close / Follow Low / Classic / Fixed',`${key('cameraMode')} to cycle (1 / 2 / 3: Follow / Classic / Fixed)`,`${pad('cameraMode')} to cycle`],
      ['Look around','Drag mouse','Right stick'],['Tutorial / Practice / music / deck','Pause → menu options','Menu → choose with stick + A'],
    ])+'<p>Clean landings bank points. A bail loses the current combo, then respawns you on nearby flat ground with three flashes. At 00:00, finish an attempt already in progress before the short grace period ends; Practice keeps going.</p>'},
  ];
}
