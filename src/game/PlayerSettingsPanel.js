import { CONTROL_ACTIONS, keyLabel, padLabel, withBinding } from '../input/ControlBindings.js';
import { readPlayerPreferences, savePlayerPreferences, applyPlayerPreferences, PLAYER_PREFERENCE_RANGES } from './PlayerPreferences.js';
import { readAudioVolume, saveAudioVolume, readBackgroundAudio, saveBackgroundAudio } from './AudioSettings.js';

const escape = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const options = [
  ['uiScale','Text size','Scale supporting text and controls, including tutorial instructions.'],
  ['highContrast','High-contrast HUD','Solid backing and plain numerals for speed, score and timer.'],
  ['renderScale','Render scale','Native (100%) preserves sharpness; lowering saves GPU work.'],
  ['cameraDistance','Camera distance','Closer framing or a wider view of the next obstacle.'],
  ['cameraFov','Field of view','Base camera lens; a larger angle shows more of the park.'],
  ['speedFov','Speed zoom','Amount the view opens up at speed. Zero keeps the lens steady.'],
  ['liquid','Bail liquid','Show the dark-red puddle and splash at body impact.'],
  ['performance','Frame display','Compact measured frame rate and frame time while skating.'],
];
const valueLabel=(key,value)=>typeof value==='boolean'?(value?'ON':'OFF'):key==='cameraFov'?`${value}°`:`${Math.round(value*100)}%`;
function preferenceRow(key,label,detail,value) {
  const toggle=typeof value==='boolean';
  return `<div class="player-setting-row"><div><strong>${label}</strong><p>${detail}</p></div><div class="player-setting-control">${toggle?
    `<button data-menu data-action="preferenceToggle" data-setting="${key}" aria-pressed="${value}">${valueLabel(key,value)}</button>`:
    `<button data-menu data-action="preferenceStep" data-setting="${key}" data-delta="-1" aria-label="Decrease ${label}">−</button><output data-preference-value="${key}">${valueLabel(key,value)}</output><button data-menu data-action="preferenceStep" data-setting="${key}" data-delta="1" aria-label="Increase ${label}">+</button>`}</div></div>`;
}
export function renderPlayerSettings(preferences=readPlayerPreferences(),input,mode='xbox') {
  const bindings=input?.bindings;
  return `<article class="player-settings" aria-label="Player settings">
    <header><span class="session-eyebrow">YOUR SETUP / SAVED AUTOMATICALLY</span><h2>Make it yours.</h2><p>Adjust the view and feel. Menu navigation always keeps its familiar controls.</p></header>
    <nav class="settings-section-links" aria-label="Settings sections"><button data-menu data-action="settingsSection" data-section="settings-view">Accessibility</button><button data-menu data-action="settingsSection" data-section="settings-camera">Camera</button><button data-menu data-action="settingsSection" data-section="settings-graphics">Graphics</button><button data-menu data-action="settingsSection" data-section="settings-audio">Sound</button><button data-menu data-action="settingsSection" data-section="settings-controls">Controls</button></nav>
    ${[['settings-view','Accessibility',['uiScale','highContrast','liquid']],['settings-camera','Camera',['cameraDistance','cameraFov','speedFov']],['settings-graphics','Graphics',['renderScale','performance']]].map(([id,title,keys])=>`<section aria-labelledby="${id}"><h3 id="${id}">${title}</h3>${options.filter(([key])=>keys.includes(key)).map(([key,label,detail])=>preferenceRow(key,label,detail,preferences[key])).join('')}</section>`).join('')}
    <section aria-labelledby="settings-audio"><h3 id="settings-audio">Sound</h3>
      ${['music','effects','announcer','crowd','voice'].map((key,index)=>preferenceRow(key,['Music','Skating effects','Countdown & session cues','Crowd reactions','Character voice'][index],['Soundtrack volume.','Wheels, tricks, landings and impacts.','Ready, start and time warnings.','Applause for accepted landed lines.','Effort and contact reactions.'][index],readAudioVolume(key))).join('')}
      ${preferenceRow('backgroundAudio','Music in background','Keep the soundtrack playing when you switch tabs. Skating pauses.',readBackgroundAudio())}</section>
    <section aria-labelledby="settings-controls"><h3 id="settings-controls">Controls</h3><p class="settings-note">Select a binding, then press the new key or button. Conflicts offer a swap. Escape cancels. Left stick moves; right stick looks. Directions combine with trick buttons. Hold both spin buttons + Up / Down for practice markers.</p>
      <div class="binding-head"><span>Action</span><span>Keyboard</span><button data-menu data-action="bindingLabels" aria-label="Change controller label style">${mode==='playstation'?'PLAYSTATION':'XBOX'} LABELS</button></div>
      <div class="binding-list">${CONTROL_ACTIONS.map(action=>`<div class="binding-row"><span>${action.label}</span>${['keyboard','gamepad'].map(device=>`<button data-menu data-action="controlBind" data-control="${action.id}" data-device="${device}" aria-label="Rebind ${action.label} ${device}">${escape(device==='keyboard'?(bindings?.[action.id]?.keyboard||action.keyboard).map(keyLabel).join(' / '):padLabel(bindings?.[action.id]?bindings[action.id].gamepad:action.gamepad,mode))}</button>`).join('')}</div>`).join('')}</div>
      <p class="settings-note">Esc / Start pause; Enter / A confirms menus; B returns; Select / Backspace skips music. H opens Tutorial; 1–3 select Follow, Classic and Fixed. Use C / R3 to cycle all five camera views.</p>
      <button data-menu data-action="resetBindings">RESET DEFAULT CONTROLS</button></section>
    <div class="binding-capture" role="dialog" aria-modal="true" aria-label="Choose a new control" hidden><strong data-capture-label></strong><p data-capture-status role="status" aria-live="polite"></p><div><button data-menu data-action="swapBinding" hidden>SWAP BINDINGS</button><button data-menu data-action="unbindButton" hidden>UNASSIGN BUTTON</button><button data-menu data-action="cancelBinding">CANCEL · ESC</button></div></div>
    <footer><p data-settings-status role="status" aria-live="polite">Settings are saved on this device.</p><button data-menu data-action="back">← BACK</button></footer>
  </article>`;
}

/** The shell owns navigation. This controller owns settings and capture lifecycle. */
export class PlayerSettingsPanel {
  constructor(root,{input,onChange=()=>{},preferences=readPlayerPreferences()}={}) {
    this.root=root;this.input=input;this.preferences=preferences;this.onChange=onChange;this.capture=null;
    this.mode=root.querySelector('[data-action="bindingLabels"]')?.textContent.includes('PLAYSTATION')?'playstation':'xbox';this.events=new AbortController();
    this._key=event=>{
      if(!this.capturing)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(event.code==='Escape'){this.endCapture();return;}
      if(event.code==='Tab'){
        const buttons=[...this.root.querySelectorAll('.binding-capture button')].filter(b=>!b.hidden),index=buttons.indexOf(document.activeElement);
        buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();return;
      }
      if(event.code==='Enter'){
        const button=document.activeElement;
        if(button?.closest?.('.binding-capture'))this.handleAction(button.dataset.action,button);
        return;
      }
      if(this.capture.device==='keyboard'&&!event.repeat&&!event.metaKey&&!event.ctrlKey&&!event.altKey)this.accept(event.code);
      else if(this.capture.device==='keyboard'&&['ControlLeft','ControlRight','AltLeft','AltRight'].includes(event.code))this.accept(event.code);
    };
    window.addEventListener('keydown',this._key,{capture:true,signal:this.events.signal});
  }
  get capturing(){return !!this.capture;}
  status(message){const el=this.root.querySelector('[data-settings-status]');if(el)el.textContent=message;}
  handleAction(action,button) {
    if(action==='settingsSection'){
      const section=this.root.querySelector('#'+button.dataset.section)?.closest('section');
      const first=section?.querySelector('[data-menu]');first?.focus({preventScroll:true});
      section?.scrollIntoView({block:'start',behavior:'instant'});return true;
    }
    const setting=button?.dataset?.setting;
    if(action==='preferenceStep'||action==='preferenceToggle'){
      const audio=['music','effects','announcer','crowd','voice'].includes(setting);
      if(audio){const value=saveAudioVolume(setting,readAudioVolume(setting)+Number(button.dataset.delta)*.1);this.onChange({[`${setting}Volume`]:value});this.updateValue(setting,value);}
      else if(setting==='backgroundAudio'){const value=saveBackgroundAudio(!readBackgroundAudio());this.onChange({backgroundAudio:value});this.updateValue(setting,value);}
      else if(Object.hasOwn(this.preferences,setting)){
        const current=this.preferences[setting],range=PLAYER_PREFERENCE_RANGES[setting];
        const value=typeof current==='boolean'?!current:Number((current+Number(button.dataset.delta)*(range?.[2]||.1)).toFixed(2));
        this.preferences=savePlayerPreferences({...this.preferences,[setting]:value});applyPlayerPreferences(this.preferences);this.onChange(this.preferences);this.updateValue(setting,this.preferences[setting]);
      }
      this.status('Saved.');return true;
    }
    if(action==='controlBind'){this.startCapture(button.dataset.control,button.dataset.device,button);return true;}
    if(action==='cancelBinding'){this.endCapture();return true;}
    if(action==='unbindButton'&&this.capture?.device==='gamepad'){this.accept(null);return true;}
    if(action==='swapBinding'&&this.conflict){
      const {id,device,value}=this.capture, other=this.conflict;
      const next=structuredClone(this.input.bindings),old=next[id][device];
      next[id][device]=device==='keyboard'?[value]:value;next[other][device]=old;
      if(device==='keyboard')this.input.blockedKeys?.add(value);this.input.setBindings(next);this.refreshBindings();this.endCapture('Bindings swapped and saved.');return true;
    }
    if(action==='resetBindings'){this.input?.resetBindings();this.refreshBindings();this.status('Default controls restored.');return true;}
    if(action==='bindingLabels'){this.mode=this.mode==='xbox'?'playstation':'xbox';button.textContent=this.mode.toUpperCase()+' LABELS';this.refreshBindings();return true;}
    return false;
  }
  updateValue(key,value){
    const output=this.root.querySelector(`[data-preference-value="${key}"]`);
    if(output)output.textContent=valueLabel(key,value);
    const button=this.root.querySelector(`[data-action="preferenceToggle"][data-setting="${key}"]`);
    if(button){button.textContent=valueLabel(key,value);button.setAttribute('aria-pressed',String(value));}
  }
  refreshBindings(){
    this.root.querySelectorAll('[data-action="controlBind"]').forEach(button=>{
      const binding=this.input.bindings[button.dataset.control],device=button.dataset.device;
      button.textContent=device==='keyboard'?binding.keyboard.map(keyLabel).join(' / '):padLabel(binding.gamepad,this.mode);
    });
  }
  startCapture(id,device,button){
    if(!this.input)return;
    this.capture={id,device,button};this.conflict=null;this.previousPad=[];this.armed=false;
    const dialog=this.root.querySelector('.binding-capture');dialog.hidden=false;
    this.root.querySelectorAll('.player-settings>header,.player-settings>nav,.player-settings>section,.player-settings>footer').forEach(node=>{node.inert=true;});
    dialog.querySelector('[data-capture-label]').textContent=`${CONTROL_ACTIONS.find(a=>a.id===id).label} · ${device}`;
    dialog.querySelector('[data-capture-status]').textContent=device==='keyboard'?'Press one key. Escape cancels.':'Release all controller buttons, then press one button. Escape cancels.';
    dialog.querySelector('[data-action="swapBinding"]').hidden=true;
    dialog.querySelector('[data-action="unbindButton"]').hidden=device!=='gamepad';
    dialog.querySelector('[data-action="cancelBinding"]').focus();
    this.input.clear();
  }
  accept(value){
    if(!this.capture)return;
    const {id,device}=this.capture;this.capture.value=value;
    const result=withBinding(this.input.bindings,id,device,value);
    if(result.ok){
      if(device==='keyboard')this.input.blockedKeys?.add(value);
      this.input.setBindings(result.bindings);this.refreshBindings();this.endCapture('Control saved.');
    }
    else {this.conflict=result.conflict||null;this.root.querySelector('[data-capture-status]').textContent=result.error;this.root.querySelector('[data-action="swapBinding"]').hidden=!this.conflict;}
  }
  update(){
    if(!this.capture||this.capture.device!=='gamepad')return;
    const pad=[...(navigator.getGamepads?.()||[])].find(p=>p?.connected),buttons=pad?.buttons?.map(b=>b.pressed)||[];
    if(!this.armed){this.armed=!!pad&&!buttons.some(Boolean);this.previousPad=buttons;return;}
    const index=buttons.findIndex((held,i)=>held&&!this.previousPad[i]);this.previousPad=buttons;
    if(index>=0){
      if(this.conflict&&index===0)this.handleAction('swapBinding');
      else if((this.conflict&&index===1)||index===8||index===9)this.endCapture();
      else this.accept(index);
    }
  }
  endCapture(message){
    const button=this.capture?.button;this.capture=null;this.conflict=null;
    const dialog=this.root.querySelector('.binding-capture');if(dialog)dialog.hidden=true;
    this.root.querySelectorAll('.player-settings>header,.player-settings>nav,.player-settings>section,.player-settings>footer').forEach(node=>{node.inert=false;});
    this.input?.clear();button?.focus();if(message)this.status(message);
  }
  dispose(){this.events.abort();this.endCapture();}
}
