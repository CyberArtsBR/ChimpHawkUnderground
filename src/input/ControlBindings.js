export const BINDINGS_KEY = 'streetskate.controlBindings.v1';
// Menu navigation is deliberately fixed; a gameplay rebind cannot strand a player.
export const RESERVED_KEYS = new Set(['Escape', 'Enter', 'NumpadEnter', 'Tab', 'Backspace',
  'KeyH', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'MetaLeft', 'MetaRight']);
export const RESERVED_BUTTONS = new Set([8, 9, 16]);
const action = (id, label, keyboard, gamepad = null) => Object.freeze({ id, label, keyboard, gamepad });
export const CONTROL_ACTIONS = Object.freeze([
  action('up','Forward / trick up',['KeyW'],12), action('down','Back / trick down',['KeyS'],13),
  action('left','Steer / trick left',['KeyA'],14), action('right','Steer / trick right',['KeyD'],15),
  action('ollie','Ollie / charge',['Space'],0), action('flip','Flip',['ArrowLeft'],2),
  action('grab','Grab',['ArrowRight'],1), action('grind','Grind',['ArrowUp'],3),
  action('spinLeft','Spin left',['KeyQ'],4), action('spinRight','Spin right',['KeyE'],5),
  action('brake','Brake',['ShiftLeft','ShiftRight']), action('vertExit','Vert exit',['ControlLeft'],6),
  action('switchStance','Switch stance',['ControlRight'],7), action('cameraMode','Camera mode',['KeyC'],11),
  action('reset','Reset rider',['KeyR']), action('practiceMark','Set practice marker',['KeyM']),
  action('practiceReturn','Return to marker',['KeyN']),
]);
export const DEFAULT_BINDINGS = Object.freeze(Object.fromEntries(CONTROL_ACTIONS.map(a => [a.id, Object.freeze({keyboard: Object.freeze([...a.keyboard]), gamepad: a.gamepad})])));
export const cloneBindings = () => Object.fromEntries(CONTROL_ACTIONS.map(a => [a.id, {keyboard:[...a.keyboard],gamepad:a.gamepad}]));
export function validKey(code) { return typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash)$/.test(code) && !RESERVED_KEYS.has(code); }
export function validateBinding(bindings, actionId, device, value) {
  if (!DEFAULT_BINDINGS[actionId] || !['keyboard','gamepad'].includes(device)) return {ok:false,error:'Unknown control.'};
  if (device === 'keyboard' && !validKey(value)) return {ok:false,error:'That key is reserved for menus or the browser.'};
  if (device === 'gamepad' && (value !== null && (!Number.isInteger(value) || value<0 || value>15 || RESERVED_BUTTONS.has(value)))) return {ok:false,error:'Start / Select / Home stay assigned to menus.'};
  for (const entry of CONTROL_ACTIONS) {
    if (entry.id===actionId) continue;
    const bound=bindings[entry.id];
    if (device==='keyboard' ? bound.keyboard.includes(value) : value!==null && bound.gamepad===value)
      return {ok:false,conflict:entry.id,error:`Already used by ${entry.label}. Choose another input, or reset controls.`};
  }
  return {ok:true};
}
export function withBinding(bindings, actionId, device, value) {
  const check = validateBinding(bindings, actionId, device, value);
  if (!check.ok) return check;
  const next = Object.fromEntries(CONTROL_ACTIONS.map(a=>[a.id,{...bindings[a.id],keyboard:[...bindings[a.id].keyboard]}]));
  next[actionId][device] = device==='keyboard' ? [value] : value;
  return {ok:true,bindings:next};
}
export function readBindings(storage) {
  const defaults=cloneBindings();
  try {
    if(storage===undefined)storage=globalThis.localStorage;
    const saved=JSON.parse(storage?.getItem(BINDINGS_KEY)||'null');
    if (!saved || saved.version!==1 || !saved.actions) return defaults;
    const result=cloneBindings(), keys=new Set(), buttons=new Set();
    for (const action of CONTROL_ACTIONS) {
      const entry=saved.actions[action.id];
      if (!entry || !Array.isArray(entry.keyboard) || entry.keyboard.length<1 || entry.keyboard.length>2 || entry.keyboard.some(k=>!validKey(k) || keys.has(k)) || new Set(entry.keyboard).size!==entry.keyboard.length) return defaults;
      if (entry.gamepad!==null && (!Number.isInteger(entry.gamepad) || entry.gamepad<0 || entry.gamepad>15 || RESERVED_BUTTONS.has(entry.gamepad) || buttons.has(entry.gamepad))) return defaults;
      entry.keyboard.forEach(k=>keys.add(k));if(entry.gamepad!==null)buttons.add(entry.gamepad);
      result[action.id]={keyboard:[...entry.keyboard],gamepad:entry.gamepad};
    }
    return result;
  } catch { return defaults; }
}
export function saveBindings(bindings, storage) {
  try { if(storage===undefined)storage=globalThis.localStorage;storage?.setItem(BINDINGS_KEY,JSON.stringify({version:1,actions:bindings})); } catch {}
}
export function keyLabel(code) { return ({Space:'Space',ArrowLeft:'← arrow',ArrowRight:'→ arrow',ArrowUp:'↑ arrow',ArrowDown:'↓ arrow',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',ShiftLeft:'Left Shift',ShiftRight:'Right Shift'})[code] || code.replace(/^Key/,'').replace(/^Digit/,'').replace(/([a-z])([A-Z])/g,'$1 $2'); }
export function padLabel(button, mode='xbox') {
  if(button===null)return 'Unassigned';
  const xbox=['A','B','X','Y','LB','RB','LT','RT','Select','Start','L3','R3','D-pad ↑','D-pad ↓','D-pad ←','D-pad →'];
  const ps=['Cross','Circle','Square','Triangle','L1','R1','L2','R2','Share','Options','L3','R3','D-pad ↑','D-pad ↓','D-pad ←','D-pad →'];
  return (mode==='playstation'?ps:xbox)[button] || `Button ${button}`;
}
