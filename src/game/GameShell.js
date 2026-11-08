import { gameAssetUrl } from './AssetPaths.js';
import { tutorialPages } from './TutorialPages.js';
import { FlipSchoolPlayer, renderFlipSchool } from './FlipSchool.js';
import { ALL_FLIP_LESSONS as FLIP_LESSONS } from './FlipLessons.js';
import { nextMenuIndex } from '../input/MenuNavigation.js';
import { MusicPlayer } from './MusicPlayer.js';
import { readAudioVolume, saveAudioVolume } from './AudioSettings.js';
import { DEFAULT_BOARD_FINISH } from '../skateboard/BoardFinishes.js';
import { sessionWarning, countdownCrossing } from './SessionCountdown.js';
import { setHudGlyphValue } from './HudGlyphs.js';
import { isValidGlbHeader } from '../input/GlbHeader.js';
import { inspectGlb } from '../../tools/agent10-glb-inspector.mjs';
import { DEFAULT_CHARACTERS, BOARD_CHOICES, LOCATIONS } from './LoadoutCatalog.js';
import { characterPortrait, forgetCharacterPortrait } from './CharacterPortraits.js';
import { boardPortraits } from './BoardPortraits.js';
import { graffitiLettering } from './GraffitiLettering.js';
import { GRAPHICS_PRESET_ORDER, GRAPHICS_PRESETS, GRAPHICS_DESCRIPTIONS, DEFAULT_GRAPHICS_PRESET } from '../graphics/GraphicsSettings.js';
import { RUN_SCORE_RULES } from './RunFinalScore.js';
import { STICK_DEAD_ZONES } from '../input/SkateInput.js';
import { SessionFlow } from './SessionFlow.js';
import { renderPlayerSettings, PlayerSettingsPanel } from './PlayerSettingsPanel.js';
import { readPlayerPreferences, applyPlayerPreferences } from './PlayerPreferences.js';
import { CAMERA_MODES, CAMERA_LABELS, DEFAULT_CAMERA_MODE } from './CameraModes.js';
import { WHEELS, GRAPHICS, readBoardStyle, saveBoardStyle } from '../skateboard/BoardStyles.js';
import { GLOW_CONTROLS, stepGlowValue } from '../graphics/GlowTuning.js';

const safe = value => String(value).replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const stored = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const persist = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
const number = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
const points = value => Math.round(number(value)).toLocaleString();
const seconds = value => `${number(value).toFixed(1)} s`;
const meters = value => number(value)>=1000 ? `${(number(value)/1000).toFixed(2)} km` : `${Math.round(number(value))} m`;
// Hidden binding dialogs and inert background controls cannot accept focus.
const availableMenuTarget = node => !node.disabled && !node.hidden && !node.closest?.('[hidden], [inert]');
export class GameShell {
  constructor(actions) {
    this.actions=actions;this.phase='title';this.ready=false;this.practice=false;this.remaining=90;
    this.sessionFlow=new SessionFlow();this.playerPreferences=applyPlayerPreferences(readPlayerPreferences());
    this.settingsPanel=null;this.goRemaining=0;this.timeupSeen=false;
    this.selection=0;this.previousPad={};this.padFocused=false;this.padIdentity=null;this.navRepeat=0;this.tutorialSeen=false;this.page=0;
    this.pages=[{image:gameAssetUrl('/media/trick-guide-16x9.webp')},...tutorialPages()];
    this.flipLessonIndex=0;this.flipInputMode='xbox';this.flipPlayer=null;
    // Follow Classic 2 became the default (2026-11): switch every player to it
    // once, then remember whatever camera they pick afterwards.
    const cameraDefaultApplied=stored('streetskate.cameraDefault','')===DEFAULT_CAMERA_MODE;
    if(!cameraDefaultApplied){persist('streetskate.cameraDefault',DEFAULT_CAMERA_MODE);persist('streetskate.camera',DEFAULT_CAMERA_MODE);}
    this.cameraIndex=Math.max(0,CAMERA_MODES.indexOf(cameraDefaultApplied?stored('streetskate.camera',DEFAULT_CAMERA_MODE):DEFAULT_CAMERA_MODE));
    this.graphicsIndex=GRAPHICS_PRESET_ORDER.indexOf(DEFAULT_GRAPHICS_PRESET);
    this.bloomEnabled=stored('streetskate.bloomEnabled','on')!=='off';
    this.smoothEdges=stored('streetskate.smoothEdges','on')==='on';
    this.songToastRemaining=4;
    this.sound=stored('streetskate.sound','on')!=='off';
    this.hasSavedFinish=stored('streetskate.boardFinish',null)!==null;
    const savedFinish=Number(stored('streetskate.boardFinish',DEFAULT_BOARD_FINISH));
    this.finishIndex=Number.isInteger(savedFinish)&&savedFinish>=0&&savedFinish<BOARD_CHOICES.length?savedFinish:DEFAULT_BOARD_FINISH;
    this.inputGrace=0;
    this.effectsVolume=readAudioVolume('effects');
    this.heroes=[...DEFAULT_CHARACTERS];this.heroIndex=0;this.boardIndex=this.finishIndex;this.locationIndex=0;
    this.selectBusy=false;this.selectError='';this.avatarUrl=null;this.pendingMode=null;
    this.loadoutGeneration=0;this.avatarUploadGeneration=0;
    this.mapUploadGeneration=0;this.mapUploadBusy=false;this.mapUploadStatus='';this.testMapName=null;
    this.runSummary=null;this.timeupEndsAt=0;this.replayDisplayKey='';
    this.heroConfirmed=false;this.boardConfirmed=false;this.focusHint=null;
    this.root=document.createElement('section');this.root.id='game-shell';this.root.setAttribute('aria-label','Game menu');
    this.root.innerHTML='<div class="title-art"></div><div class="shell-content"></div><div class="menu-footnote">↑ ↓ ← → / LEFT STICK · ENTER / A SELECT · ESC / B BACK</div>';
    document.body.append(this.root);this.content=this.root.querySelector('.shell-content');
    this.timer=document.createElement('div');this.timer.id='run-timer';this.timer.setAttribute('role','timer');
    this.timerValue=document.createElement('span');this.timer.append(this.timerValue);document.querySelector('#app').append(this.timer);
    this.roundCue=document.createElement('aside');this.roundCue.className='round-cue';
    this.roundCue.setAttribute('role','status');this.roundCue.hidden=true;document.querySelector('#app').append(this.roundCue);
    this.song=document.createElement('aside');this.song.id='now-playing';this.song.setAttribute('aria-label','Soundtrack');
    this.song.innerHTML='<span class="song-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M10 17V6l10-2v11M10 9l10-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="7" cy="17" rx="3" ry="2.5" fill="currentColor"/><ellipse cx="17" cy="15" rx="3" ry="2.5" fill="currentColor"/></svg></span><div class="song-copy"><span class="song-label">NOW PLAYING</span><strong class="song-title" aria-live="polite"></strong><span class="song-skip">Press <kbd>Select</kbd> / <kbd>Backspace</kbd> to skip</span><span class="song-note" hidden></span></div>';
    document.body.append(this.song);
    const songTitle=this.song.querySelector('.song-title'),songNote=this.song.querySelector('.song-note');
    this.music=new MusicPlayer((title,note)=>{
      songTitle.textContent=title;songNote.textContent=note||'';songNote.hidden=!note;
      this.songToastRemaining=4;this.song.classList.remove('song-compact');
    });
    this.avatarInput=document.createElement('input');
    this.avatarInput.type='file';this.avatarInput.accept='.glb,model/gltf-binary';this.avatarInput.hidden=true;
    document.body.append(this.avatarInput);
    this.avatarInput.addEventListener('change',async()=>{
      // Even a rejected replacement cancels the previous asynchronous read.
      const uploadGeneration=++this.avatarUploadGeneration;
      const file=this.avatarInput.files?.[0];this.avatarInput.value='';
      if(!file)return;
      if(file.size>35*1024*1024 || file.size<20 || !/\.glb$/i.test(file.name)) {
        this.selectError='Choose a rigged .GLB file smaller than 35 MB.';this.render();return;
      }
      // Validate both the header and the full GLB structure *before* exposing
      // untrusted bytes to GLTFLoader or creating a persistent object URL.
      // The inspector rejects external/data URI resources and oversized rigs.
      try {
        const buffer=await file.arrayBuffer();
        if(uploadGeneration!==this.avatarUploadGeneration)return;
        if(!isValidGlbHeader(buffer.slice(0,20),buffer.byteLength))
          throw new Error('Invalid GLB 2.0 header or JSON chunk.');
        inspectGlb(buffer);
      } catch(error) {
        if(uploadGeneration!==this.avatarUploadGeneration)return;
        this.selectError='Invalid GLB header or content: '+(error?.message||'Unable to read file.');
        this.render();return;
      }
      const next=URL.createObjectURL(file);
      if(this.avatarUrl){
        forgetCharacterPortrait(this.avatarUrl);
        URL.revokeObjectURL(this.avatarUrl);
      }
      this.avatarUrl=next;
      this.heroes=this.heroes.filter(h=>h.id!=='custom');
      this.heroes.push({id:'custom',name:file.name.replace(/\.glb$/i,''),subtitle:'YOUR UPLOADED RIDER',url:next,uploadFilename:file.name,accent:'#ffc469'});
      this.heroIndex=this.heroes.length-1;this.heroConfirmed=false;
      this.focusHint={action:'hero',index:this.heroIndex};
      this.selectError='Avatar ready · select this rider with A / Enter / Click before continuing.';
      this.render();
    });
    this.mapInput=document.createElement('input');
    this.mapInput.type='file';this.mapInput.accept='.glb,model/gltf-binary';this.mapInput.hidden=true;
    this.mapInput.setAttribute('aria-label','Choose a test map GLB');
    document.body.append(this.mapInput);
    this.mapInput.addEventListener('change',()=>{
      const file=this.mapInput.files?.[0];this.mapInput.value='';
      if(file)this.uploadTestMap(file);
    });
    window.addEventListener('keydown',e=>this.key(e),true);
    this.render();
  }
  get active(){return this.phase==='playing';}
  get simulating(){return this.active&&this.sessionFlow.snapshot().allowSimulation;}
  get open(){return this.phase==='tutorial';}
  setReady(){this.ready=true;this.render();}
  // Hide a subtitle that only repeats the rider's name (e.g. "The Hollow / THE HOLLOW").
  heroSubtitle(hero){return String(hero.subtitle||'').toLowerCase()===String(hero.name||'').toLowerCase()?'':hero.subtitle||'';}
  // The start button says what is still missing instead of sitting greyed out.
  loadoutStartLabel(){return this.selectBusy?'LOADING RIDER…':!this.ready?'LOADING MAP…':!this.heroConfirmed?'PICK A RIDER':!this.boardConfirmed?'PICK A DECK':'LET’S SKATE →';}
  setScreen(phase){
    if(this.phase==='creator'&&phase!=='creator'&&this.mapUploadBusy){
      this.mapUploadGeneration++;this.mapUploadBusy=false;this.mapUploadStatus='';this.actions.cancelLoadout?.();
    }
    if(this.phase==='highlights'&&phase!=='highlights')this.actions.stopHighlights?.();
    // Leaving the selector invalidates any pending rider swap's UI completion.
    // A previously started loader may still resolve, but must never reopen a
    // tutorial or overwrite the player's new screen after Back/Escape.
    if(this.phase==='select'&&phase!=='select'){
      this.loadoutGeneration++;
      if(this.selectBusy)this.actions.cancelLoadout?.();
      this.selectBusy=false;
      this.updateLoadingOverlay();
    }
    this.phase=phase;this.selection=0;this.navRepeat=.2;this.render();
  }
  menuButtons(){return [...this.content.querySelectorAll('button[data-menu]')].filter(availableMenuTarget);}
  focusSelection(reveal=true){
    const buttons=this.menuButtons();
    if(!buttons.length){this.selection=0;return;}
    this.selection=(this.selection+buttons.length)%buttons.length;
    buttons.forEach((b,i)=>b.classList.toggle('selected',i===this.selection));
    const target=buttons[this.selection];
    target?.focus({preventScroll:true});
    // Controller focus may be below the fold in the scrollable loadout.
    // Reveal it without scrolling the entire window or stealing pointer focus.
    if(reveal&&['select','pause','options','settings','creator','graphics','results','flipSchool','tutorial'].includes(this.phase))
      target?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'auto'});
  }
  // Keyboard and gamepad share the same logical layout-aware focus route.
  moveSelection(axis, sign) {
    const buttons=this.menuButtons();
    if(!buttons.length)return;
    const focusedIndex=buttons.indexOf(document.activeElement);
    if(focusedIndex>=0)this.selection=focusedIndex;
    this.selection=nextMenuIndex(buttons,this.selection,axis,sign,this.phase==='select');
    this.focusSelection();
  }
  button(label,action,disabled=false){return `<button data-menu data-action="${action}" ${disabled?'disabled':''}>${label}</button>`;}
  volumeControl(channel, label, value){
    return `<div class="audio-volume-control" role="group" aria-label="${label} volume">
      <span>${label} <strong>${Math.round(value*100)}%</strong></span>
      <button data-menu data-action="${channel}Down" aria-label="Decrease ${label.toLowerCase()} volume">−</button>
      <button data-menu data-action="${channel}Up" aria-label="Increase ${label.toLowerCase()} volume">+</button>
      <span class="audio-meter" aria-hidden="true" style="--volume:${Math.round(value*100)}%"></span></div>`;
  }
  glowControls(status, preset) {
    const values = status?.glowTuning;
    if (!values) return '';
    const rows = GLOW_CONTROLS.map((control,index) => {
      const value = Number(values[control.key]);
      const disabled = false;
      const position = Math.max(0, Math.min(100, (value-control.min)/(control.max-control.min)*100));
      return `<div class="graphics-glow-row" role="group" aria-label="${control.label}">
        <div class="graphics-glow-copy"><strong>${control.label}</strong><span>${control.hint}</span>
          <i class="graphics-glow-meter" aria-hidden="true"><i data-glow-meter="${control.key}" style="width:${position}%"></i></i></div>
        <div class="graphics-glow-control">
          <button data-menu data-action="glowAdjust" data-index="${index*2}" aria-label="Decrease ${control.label}" ${disabled?'disabled':''}>−</button>
          <output data-glow-value="${control.key}" aria-live="polite">${value.toFixed(2)}${control.suffix}</output>
          <button data-menu data-action="glowAdjust" data-index="${index*2+1}" aria-label="Increase ${control.label}" ${disabled?'disabled':''}>+</button>
        </div></div>`;
    }).join('');
    const note = 'Shared glow defaults across presets. Your adjustments are saved per preset; the board has its own emission.';
    return `<section class="graphics-glow-settings" aria-label="Light and glow settings">
      <div class="graphics-glow-heading"><strong>LIGHT & GLOW</strong><span>FINE TUNE</span></div>
      <p>${note}</p>${rows}
      <button data-menu data-action="glowReset" class="graphics-glow-reset">RESET THIS PRESET’S GLOW</button>
      <small data-glow-status role="status" aria-live="polite"></small></section>`;
  }
  updateGlowControls(status, message) {
    if (!status?.glowTuning) return;
    for (const control of GLOW_CONTROLS) {
      const value = status.glowTuning[control.key];
      const output = this.content.querySelector(`[data-glow-value="${control.key}"]`);
      if (output) output.textContent = `${value.toFixed(2)}${control.suffix}`;
      const meter = this.content.querySelector(`[data-glow-meter="${control.key}"]`);
      if (meter) meter.style.width = `${Math.max(0,Math.min(100,(value-control.min)/(control.max-control.min)*100))}%`;
    }
    const messageNode = this.content.querySelector('[data-glow-status]');
    if (messageNode) messageNode.textContent = message;
  }
  boardLabel(){return BOARD_CHOICES[this.boardIndex]?.label||'';}
  locationName(){return this.testMapName||LOCATIONS[this.locationIndex]?.name||'';}
  loadoutStatus(){return this.selectError||(!this.ready?'Loading the map… pick your rider, deck and spot meanwhile.':!this.heroConfirmed||!this.boardConfirmed?'Choose a rider and a deck with A / Enter / Click to unlock START SESSION.':'Rider and deck selected · Ready to start session.');}
  renderMenuFrame(title, body){
    const hero=this.heroes[this.heroIndex];
    const spot=LOCATIONS[this.locationIndex];
    const captions={pause:'Take a breath. Your next line is waiting.',options:'Your setup. Your sound. Your session.',graphics:'Set the look. Find your flow.'};
    return `<div class="menu-stage">
      <aside class="menu-session-art" data-location="${safe(spot.id)}" aria-label="Session preview">
        <span class="menu-art-kicker">CHIMP HAWK / UNDERGROUND</span>
        <div class="menu-art-title" aria-hidden="true">${this.phase==='pause'?'STAY<br>IN FLOW.':'MAKE<br>IT YOURS.'}</div>
        <span class="menu-rider" style="--rider-accent:${hero.accent}" data-portrait-url="${safe(hero.url)}" data-preview-state="loading"></span>
        <div class="menu-art-caption"><span>YOUR SESSION</span><strong>${safe(hero.name)}</strong><small>${safe(this.locationName())}</small></div>
        <span class="menu-art-stamp" aria-hidden="true">SKATE / REPEAT</span><div class="menu-music-slot"></div>
      </aside>
      <div class="menu-card ${this.phase==='graphics'?'graphics-card':''}"><header class="menu-card-heading"><small>THE SESSION LAB</small><h2>${safe(title)}</h2><p>${captions[this.phase]||''}</p></header>${body}</div>
    </div>`;
  }
  render(){
    // Bindings may have changed in Settings since the guide was first created.
    if(this.phase==='tutorial')this.pages=[this.pages[0],...tutorialPages(this.actions.input?.bindings)];
    this.settingsPanel?.dispose();this.settingsPanel=null;
    this.flipPlayer?.dispose();this.flipPlayer=null;
    // Keep the music panel alive while replacing menu contents; selection
    // screens give it a layout slot so it never covers their heading/cards.
    if(this.song&&this.song.parentElement!==document.body)document.body.append(this.song);
    document.body.dataset.screen=this.phase;this.root.hidden=this.active;
    this.updateRoundCue();
    this.actions.screenChanged?.(this.phase);
    this.timer.hidden=!this.active;this.updateTimer();
    this.song.classList.remove('song-compact');this.songToastRemaining=4;
    this.root.className=this.phase==='title'?'title-screen':this.phase==='tutorial'?'tutorial-screen':this.phase==='select'?'loadout-screen':this.phase==='results'?'results-screen':this.phase==='timeup'?'timeup-screen':this.phase==='highlights'?'highlights-screen':'menu-screen';
    if(this.phase==='flipSchool')this.root.className='flip-school-screen';
    this.root.classList.toggle('run-art-screen',['select','pause','timeup','results'].includes(this.phase));
    if(this.active)return;
    let title='',body='';
    if(this.phase==='title') {
      body=`<button class="art-hit art-start" data-menu data-action="start" aria-label="Start Game — 90 seconds" ${this.loadError?'disabled':''}><span>START GAME</span></button><button class="art-hit art-back" data-menu data-action="launcher" aria-label="Back to Game Selection"><span>BACK TO GAME SELECTION</span></button><div class="title-tools">${this.button('PRACTICE','practice',Boolean(this.loadError))}${this.button('TUTORIAL','tutorial')}${this.button('OPTIONS','options')}</div><p class="title-status" role="status">${this.loadError?'Unable to load the park. Reload to retry.':''}</p>`;
    } else if(this.phase==='select') {
      const cards=this.heroes.map((hero,i)=>`<button data-menu data-action="hero" data-index="${i}" class="loadout-character ${this.heroConfirmed&&i===this.heroIndex?'is-chosen':''}"
        style="--rider-accent:${hero.accent}" aria-pressed="${this.heroConfirmed&&i===this.heroIndex}">
        <span class="rider-portrait" data-portrait-url="${safe(hero.url)}" data-preview-state="loading"><span class="rider-initial">${safe(hero.name[0]||'?')}</span><span class="preview-status">Loading preview…</span></span>
        <strong>${safe(hero.name)}</strong><small>${safe(this.heroSubtitle(hero))}</small></button>`).join('');
      const colors=BOARD_CHOICES.map((board,i)=>`<button data-menu data-action="board" data-index="${i}" class="loadout-deck ${this.boardConfirmed&&i===this.boardIndex?'is-chosen':''}"
        style="--deck-gradient:${board.gradient}" aria-pressed="${this.boardConfirmed&&i===this.boardIndex}"><span class="deck-thumb" data-board-preview="${i}"><span class="deck-preview"></span></span><b>${safe(board.label)}</b><span class="deck-swatch" aria-hidden="true"></span></button>`).join('');
      const spots=LOCATIONS.map((spot,i)=>`<button data-menu data-action="location" data-index="${i}"
        data-location="${safe(spot.id)}" class="loadout-location ${i===this.locationIndex?'is-chosen':''}" ${spot.available?'':'disabled'} aria-pressed="${i===this.locationIndex}">
        <span class="location-art" aria-hidden="true"><span class="map-number">MAP ${String(spot.number).padStart(2,'0')}</span><span class="location-stamp">${spot.id==='skate-paradise'?'SUNSET / SKATEPARK':spot.id==='rooftop'?'STEEL / FREIGHT':spot.id === 'grand-warehouse' ? 'ARTIST BUILD' : 'AFTER HOURS'}</span></span><strong>${safe(spot.name)}</strong><small>${safe(spot.subtitle)}</small></button>`).join('');
      body=`<div class="loadout-shell"><header><small>CHIMP HAWK / THE SESSION LAB <span class="session-mode">${this.pendingMode==='practice'?'FREE SKATE':'90 SECOND RUN'}</span></small><h2>${graffitiLettering('BUILD YOUR LINE')}</h2>
        <p>PICK YOUR RIDER. PAINT YOUR DECK. OWN YOUR SPOT.</p><p class="session-rule">${this.pendingMode==='practice'?'Unlimited practice. Save a marker, retry your line, and work through drills at your own pace.':'90 seconds. Your last attempt gets up to 6 extra seconds to land. Bail or time limit loses pending points.'}</p><div class="music-menu-slot"></div></header>
        <div class="loadout-roster loadout-roster-band" role="group" aria-label="Choose your rider">${cards}</div>
        <div class="loadout-panels">
        <section class="loadout-section rider-panel" aria-label="Choose your rider"><div class="loadout-heading"><span class="section-number">01</span><h3>${graffitiLettering('RIDER','gold')}</h3><span class="panel-kicker">THE CREW</span></div>
        <div class="selected-rider" style="--rider-accent:${this.heroes[this.heroIndex].accent}"><span class="rider-stage-number" aria-hidden="true">${String(this.heroIndex+1).padStart(2,'0')}</span>
          ${this.stagePortrait(this.heroes[this.heroIndex])}
          <div class="selected-rider-copy"><span>${this.heroConfirmed?'YOUR RIDER':'MEET THE CREW'}</span><strong>${safe(this.heroes[this.heroIndex].name)}</strong><small>${safe(this.heroSubtitle(this.heroes[this.heroIndex]))}</small></div>
        </div>${this.button('↑ IMPORT YOUR RIDER .GLB','upload')}</section>
        <section class="loadout-section deck-panel" aria-label="Choose your skateboard"><div class="loadout-heading"><span class="section-number">02</span><h3>${graffitiLettering('DECK','gold')}</h3><span class="panel-kicker">GRADIENT GLOW</span></div>
        <div class="loadout-boards">${colors}</div>${this.boardStyleRows()}<div class="selection-note"><span>${this.boardConfirmed?'DECK LOCKED IN':'CHOOSE YOUR FINISH'}</span><strong>${safe(BOARD_CHOICES[this.boardIndex].label)}</strong></div></section>
        <section class="loadout-section spot-panel" aria-label="Choose your location"><div class="loadout-heading"><span class="section-number">03</span><h3>${graffitiLettering('SPOT','gold')}</h3><span class="panel-kicker">THREE PARKS. YOUR LINE.</span></div>
        <div class="loadout-locations">${spots}</div><div class="selection-note"><span>SESSION LOCATION</span><strong>MAP ${LOCATIONS[this.locationIndex].number} / ${safe(LOCATIONS[this.locationIndex].name)}</strong></div></section></div>
        <footer>${this.button('← BACK','back')}<div class="loadout-recap"><span class="loadout-checks"><span class="${this.heroConfirmed?'complete':''}">${this.heroConfirmed?'✓':'01'} RIDER</span><span class="${this.boardConfirmed?'complete':''}">${this.boardConfirmed?'✓':'02'} DECK</span><span class="complete">✓ SPOT</span></span><span><span data-recap-rider>${safe(this.heroes[this.heroIndex].name)}</span> <i>/</i> <span data-recap-deck>${safe(BOARD_CHOICES[this.boardIndex].label)}</span> <i>/</i> <span data-recap-spot>MAP ${LOCATIONS[this.locationIndex].number}</span></span></div>${this.button(this.loadoutStartLabel(),'confirmLoadout',this.selectBusy||!this.ready||!this.heroConfirmed||!this.boardConfirmed)}</footer>
        <p class="loadout-status" aria-live="polite">${safe(this.loadoutStatus())}</p></div>`;
    } else if(this.phase==='pause') {
      title='PAUSED';body=this.button('▶ RESUME SESSION','resume')+this.button('RESTART SESSION','restart')+
        (this.practice?this.button('PRACTICE DRILLS · '+(this.actions.drillsEnabled?.()?'ON':'OFF'),'practiceDrills'):'')+
        (this.practice?this.button('INPUT DISPLAY · '+(this.actions.practiceInputsEnabled?.()?'ON':'OFF'),'practiceInputs'):'')+
        this.button('FLIP SCHOOL · VIDEO LESSONS','flipSchool')+this.button('TUTORIAL','tutorial')+this.button('OPTIONS & AUDIO','options')+this.button('MAIN MENU','title');
    } else if(this.phase==='options') {
      title='OPTIONS';body='<div class="menu-control-group"><h3>SESSION</h3>'+this.button('PRACTICE · NO TIME LIMIT','practice',!this.ready)
        +this.button('PLAYER SETTINGS & CONTROLS','settings')
        +'<div class="menu-setting-pair">'+this.button('CAMERA · '+CAMERA_LABELS[CAMERA_MODES[this.cameraIndex]],'camera')
        +this.button('GRAPHICS · '+GRAPHICS_PRESETS[GRAPHICS_PRESET_ORDER[this.graphicsIndex]].label.toUpperCase(),'graphicsMenu')+'</div>'
        +this.button('STICK DEAD ZONE · '+Math.round((this.actions.getDeadZone?.() ?? .16)*100)+'%','deadZone')+'</div>'
        +'<div class="menu-control-group"><h3>SOUND & FEEL</h3>'+this.volumeControl('music','MUSIC',this.music.musicVolume)
        +this.volumeControl('effects','EFFECTS',this.effectsVolume)
        +'<div class="menu-setting-pair">'+this.button('SKATE SOUNDS · '+(this.sound?'ON':'OFF'),'sound')
        +this.button('DECK · '+BOARD_CHOICES[this.finishIndex].label,'deck')+'</div></div>'
        +this.button('EXTRAS / CREATOR TOOLS','creator')+this.button('BACK','back');
    } else if(this.phase==='settings') {
      title='PLAYER SETTINGS';body=renderPlayerSettings(this.playerPreferences,this.actions.input,this.flipInputMode)+this.button('BACK TO OPTIONS','back');
    } else if(this.phase==='creator') {
      title='CREATOR TOOLS';body=this.button(this.mapUploadBusy?'LOADING TEST MAP…':'UPLOAD TEST MAP · GLB','uploadTestMap',!this.ready||this.mapUploadBusy)
        +`<p class="test-map-note" role="status">${safe(this.mapUploadStatus||'Local GLB · unlimited practice')}</p>`+this.button('BACK TO OPTIONS','back');
    } else if(this.phase==='graphics') {
      const key=GRAPHICS_PRESET_ORDER[this.graphicsIndex];
      const preset=GRAPHICS_PRESETS[key];
      const effective=this.actions.graphicsStatus?.();
      title='GRAPHICS';
      body='<p class="graphics-intro">Keep your line clear. Choose the detail and responsiveness that suit your display.</p>'
        +(effective?.allocation&&effective.allocation.state!=='ready'?`<p class="graphics-details" role="status">Your last supported graphics settings are still active. ${safe(effective.allocation.recovery||'Choose another setting and retry.')}</p>`:'')
        +GRAPHICS_PRESET_ORDER.map((name,i)=>`<button class="graphics-preset" data-menu data-action="graphicsSet" data-index="${i}" aria-pressed="${i===this.graphicsIndex}"><strong>${i===this.graphicsIndex?'✓ ':''}${GRAPHICS_PRESETS[name].label}</strong><span>${GRAPHICS_DESCRIPTIONS[name]}</span></button>`).join('')
        +`<button class="graphics-toggle" data-menu data-action="bloomToggle" aria-pressed="${this.bloomEnabled}">NEON GLOW · ${this.bloomEnabled?'ON':'OFF'}</button>`
        +this.glowControls(effective,key)
        +`<button class="graphics-toggle" data-menu data-action="edgeToggle" aria-pressed="${this.smoothEdges}">144 FPS EDGE SMOOTHING · ${this.smoothEdges?'ON':'OFF'}</button>`
        +'<p class="graphics-details">Optional 2× edge smoothing with glow in the 144 FPS preset; may reduce frame rate.</p>'
        +`<p class="graphics-details">${safe(effective?.label||preset.label)} · ${effective?.bloomEnabled?'Glow on':'Glow off'} · stable environment reflections.<br>144 FPS is a target; actual performance depends on your hardware and display.</p>`
        +(effective?`<details class="graphics-advanced"><summary>Rendering details</summary><p>${effective.renderWidth} × ${effective.renderHeight} internal resolution · ${effective.anisotropy}× filtering · ${effective.msaaSamples}× edge samples · 1024² local shadows${effective.postProcessingAvailable?'':' · post effects unavailable'}</p></details>`:'')
        +this.button('← BACK TO OPTIONS','back');
    } else if(this.phase==='timeup') {
      body=`<div class="timeup-burst" role="status" aria-live="assertive"><span class="session-eyebrow">SESSION COMPLETE</span><h2>${graffitiLettering('TIME’S UP','fire')}</h2><p>YOUR RUN. YOUR LINE. YOUR SCORE.</p><div class="timeup-rule" aria-hidden="true"></div>${this.button('VIEW RESULTS · ENTER / A','skipTimeup')}</div>`;
    } else if(this.phase==='results') {
      body=this.renderResults();
    } else if(this.phase==='highlights') {
      body=`<div class="highlights-overlay"><header><span class="session-eyebrow">YOUR BEST MOMENTS</span><h2>SESSION HIGHLIGHTS</h2><p data-replay-caption aria-live="polite"></p></header><footer>${this.button('← BACK TO RESULTS','stopHighlights')}<span>ESC / B · BACK TO RESULTS</span></footer></div>`;
    } else if(this.phase==='flipSchool') {
      body=renderFlipSchool(this.flipLessonIndex,this.flipInputMode,this.flipTutorial);
    } else if(this.phase==='tutorial') {
      const page=this.pages[this.page];
      const returnLabel=this.tutorialReturn==='select'?'BACK TO LOADOUT':this.tutorialReturn==='playing'?'RESUME SESSION':this.tutorialReturn==='pause'?'BACK TO PAUSE':this.tutorialReturn==='options'?'BACK TO OPTIONS':this.tutorialReturn==='graphics'?'BACK TO GRAPHICS':this.tutorialReturn==='results'?'BACK TO RESULTS':'BACK TO MENU';
      const navigation=`<footer>${this.button('← PREVIOUS','previous')}${this.button('SKIP TUTORIAL','skipTutorial')}<span>LB / RB · B / ESC BACK</span>${this.button(this.page===this.pages.length-1?returnLabel:'DETAILS / NEXT →',this.page===this.pages.length-1?'closeTutorial':'next')}</footer>`;
      body=page.image?`<div class="tutorial-poster"><img src="${page.image}" alt="Default keyboard and Xbox controls overview. Next opens readable tables using your saved controls.">${navigation.replace('DETAILS / NEXT →','YOUR CONTROLS / NEXT →')}</div>`:`<div class="tutorial-frame"><header><small>CHIMP HAWK / TUTORIAL ${this.page+1} OF ${this.pages.length}</small><h2>${page.title}</h2><p>${page.subtitle}</p>${this.page===2?this.button('FLIP SCHOOL · WATCH VIDEO LESSONS','flipSchool'):''}</header><div class="tutorial-body">${page.html}</div>${navigation}</div>`;
    }
    this.content.innerHTML=['title','tutorial','select','timeup','results','highlights','flipSchool'].includes(this.phase)?body:this.renderMenuFrame(title,body);
    if(this.phase==='select')this.content.querySelector('.music-menu-slot')?.append(this.song);
    else this.content.querySelector('.menu-music-slot')?.append(this.song);
    if(this.phase==='settings')this.settingsPanel=new PlayerSettingsPanel(this.content,{input:this.actions.input,preferences:this.playerPreferences,onChange:partial=>{
      this.playerPreferences=applyPlayerPreferences({...this.playerPreferences,...partial});
      if(partial.musicVolume!=null)this.music.setVolume(partial.musicVolume);
      if(partial.effectsVolume!=null)this.effectsVolume=partial.effectsVolume;
      if(partial.backgroundAudio!=null)this.music.setBackgroundAudio(partial.backgroundAudio);
      this.actions.preferences?.(partial,this.playerPreferences);
    }});
    for(const button of this.content.querySelectorAll('button[data-menu]')) {
      button.onclick=()=>{if(!this.settingsPanel?.handleAction(button.dataset.action,button))this.choose(button.dataset.action,Number(button.dataset.index||0));};
      // Pointer hover must NOT call focus(): it steals controller/keyboard focus,
       // especially when a vertically scrolling loadout passes under the cursor.
       button.onfocus=()=>{
         const buttons=this.menuButtons(),index=buttons.indexOf(button);
         if(index<0)return;
         this.selection=index;
         buttons.forEach((b,i)=>b.classList.toggle('selected',i===index));
       };
    }
    if(this.phase==='select'){this.loadPortraits();this.loadBoardPreviews();}
    else if(['pause','options','graphics','settings','creator'].includes(this.phase))this.loadPortraits();
    if(this.phase==='flipSchool')this.flipPlayer=new FlipSchoolPlayer(this.content,this.flipLessonIndex,this.flipInputMode,this.actions.input?.bindings);
    if(this.phase==='tutorial')this.selection=this.menuButtons().length-1;
    if(this.focusHint){
      const index=this.menuButtons().findIndex(button=>button.dataset.action===this.focusHint.action
        && Number(button.dataset.index||0)===this.focusHint.index);
      if(index>=0)this.selection=index;
      this.focusHint=null;
    }
    if(this.phase==='results'){this.content.scrollTop=0;this.animateResultsScore();}
    this.focusSelection(this.phase!=='results');
    this.updateLoadingOverlay();
  }
  /**
   * "Dropping in" loading screen shown while LET'S SKATE prepares the map,
   * rider and lighting. It lives beside the menu content, so the loadout's
   * progress re-renders only update its text and its animations keep running.
   */
  updateLoadingOverlay(){
    if(!this.root||typeof document==='undefined')return;
    let overlay=this.root.querySelector(':scope > .drop-in-loading:not(.leaving)');
    const busy=this.phase==='select'&&this.selectBusy;
    if(!busy){
      if(overlay){const leaving=overlay;leaving.classList.add('leaving');setTimeout(()=>leaving.remove(),280);}
      return;
    }
    const hero=this.heroes?.[this.heroIndex],spot=LOCATIONS[this.locationIndex];
    if(!overlay){
      overlay=document.createElement('div');
      overlay.className='drop-in-loading';
      overlay.setAttribute('role','status');
      overlay.setAttribute('aria-live','polite');
      const tips=[
        'Hold SPACE to charge a bigger ollie, release to pop.',
        'Flip mid-air: hold a direction and tap ← (X / Square).',
        'Hold ↑ (Y / Triangle) near a rail or coping to grind.',
        'W then S starts a manual: link your lines without landing the combo.',
        'On vert, Left Ctrl after the apex carries you over the coping.',
        'R puts you back on your board without losing banked points.',
      ];
      overlay.innerHTML=`<div class="drop-in-art"></div><div class="drop-in-card">
        <small>CHIMP HAWK / DROPPING IN</small><h2>DROPPING IN</h2>
        <p class="drop-in-who"><b data-drop-rider></b><span>·</span><b data-drop-spot></b></p>
        <div class="drop-in-rail" aria-hidden="true"><i class="drop-in-deck"></i><i class="drop-in-sparks"></i></div>
        <div class="drop-in-bar" aria-hidden="true"><i data-drop-fill></i></div>
        <p class="drop-in-status" data-drop-status></p>
        <div class="drop-in-tips">${tips.map((tip,i)=>`<p style="--i:${i}"><b>TIP</b> ${tip}</p>`).join('')}</div>
      </div>`;
      this.root.append(overlay);
    }
    overlay.dataset.location=spot?.id||'';
    overlay.querySelector('[data-drop-rider]').textContent=hero?.name||'';
    overlay.querySelector('[data-drop-spot]').textContent=spot?.name||'';
    const status=String(this.selectError||'Loading…');
    overlay.querySelector('[data-drop-status]').textContent=status;
    // Stage-based progress: the loader reports stages, not percentages.
    const stage=/LIGHTING/i.test(status)?.88:/CHARACTER|RIDER/i.test(status)?.6:/PARK|MAP|GEOMETRY|SURFACE|TEXTURE/i.test(status)?.35:.15;
    const fill=overlay.querySelector('[data-drop-fill]');
    const current=Number(fill.dataset.value||0);
    if(stage>current){fill.dataset.value=String(stage);fill.style.transform=`scaleX(${stage})`;}
  }
  /** Results presentation: the final score counts up from zero (visual only). */
  animateResultsScore(){
    const el=this.content?.querySelector?.('[data-final-score]');
    const raf=globalThis.requestAnimationFrame;
    if(!el||typeof raf!=='function')return;
    if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    const target=Number(String(el.textContent).replace(/[^0-9]/g,''))||0;
    if(target<=0)return;
    const start=performance.now(),duration=Math.min(1800,600+target/150);
    const step=now=>{
      if(!el.isConnected)return;
      const t=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-t,3);
      el.textContent=Math.round(target*eased).toLocaleString();
      if(t<1)raf(step);else{el.textContent=target.toLocaleString();el.classList.add('score-landed');}
    };
    el.textContent='0';
    raf(step);
  }
  renderResults(){
    const run=this.runSummary||{};
    const best=run.bestCombo||{};
    const achievements=Array.isArray(run.achievements)?run.achievements:[];
    const topTricks=Array.isArray(run.runTopTricks)?run.runTopTricks.slice(0,3):[];
    const highlights=Array.isArray(run.highlights)?run.highlights.slice(0,3):[];
    const highlightCount=Math.min(3,number(run.highlightsCount??highlights.length));
    const canReplay=this.actions.canWatchHighlights?.()??highlightCount>0;
    const finalScore=run.finalScore??run.totalScore??this.finalScore;
    const stats=[
      ['LANDED COMBOS',points(run.landedCombos)],['TRICKS LANDED',points(run.tricksLanded)],
      ['UNIQUE TRICKS',points(Array.isArray(run.uniqueTricks)?run.uniqueTricks.length:run.uniqueTricks)],['BAILS',points(run.bails)],
      ['TOP SPEED',`${number(run.topSpeedKmh).toFixed(1)} km/h`],['DISTANCE',meters(run.distanceMeters)],
      ['TOTAL AIR TIME',seconds(run.airTime)],['LONGEST AIR',seconds(run.maxAirTime)],
      ['GRIND DISTANCE',meters(run.grindDistanceMeters)],['MANUAL TIME',seconds(run.manualSeconds)]
    ].map(([label,value])=>`<div class="run-stat"><dt>${label}</dt><dd>${value}</dd></div>`).join('');
    const achievementRows=achievements.length?achievements.map((item,i)=>`<li><span class="achievement-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><div><strong>${safe(item.title)}</strong><p>${safe(item.detail)}</p></div></li>`).join(''):`<li class="run-empty"><p>No scored achievements this run. Land a trick or link a combo to build your next session.</p></li>`;
    const topRows=topTricks.length?topTricks.map((item,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><strong>${safe(item.label)}</strong><b>${points(item.points)} <small>PTS</small></b></li>`).join(''):'<li class="run-empty"><p>No scored tricks landed.</p></li>';
    return `<article class="run-results" aria-label="Session results">
      <header class="run-results-header"><div><span class="session-eyebrow">CHIMP HAWK / SESSION COMPLETE</span><h2>${graffitiLettering('YOUR RUN','gold')}</h2><p>${safe(run.mapName||LOCATIONS[this.locationIndex]?.name||'')} <span>·</span> ${Math.round(number(run.durationSeconds??90))} SEC SESSION</p></div><div class="run-loadout"><strong>${safe(run.riderName||this.heroes[this.heroIndex]?.name||'')}</strong><span>${safe(run.deckName||BOARD_CHOICES[this.boardIndex]?.label||'')}</span>${this.button('▶ Watch the Highlights','watchHighlights',!canReplay)}</div></header>
      <div class="run-results-grid"><section class="run-score-panel"><span class="session-eyebrow">FINAL SCORE</span><p class="run-total-score result-score"><strong data-final-score>${points(finalScore)}</strong><span>FINAL POINTS${run.scoreBreakdown?' · RUN WEIGHTS APPLIED':''}</span></p>${this.renderPersonalBest(run)}<div class="run-best-combo"><span class="session-eyebrow">BEST COMBO</span><strong>${points(best.points)} <small>PTS</small></strong><p>${number(best.points)>0?safe(best.label||'Landed combo'):'No combo banked this run'}</p>${number(best.trickCount)>0?`<span>${points(best.trickCount)} ${number(best.trickCount)===1?'trick':'tricks'} linked</span>`:''}</div>${this.renderScoreBreakdown(run)}<h3>THE RUN IN NUMBERS</h3><dl class="run-stats">${stats}</dl></section>
      <div class="run-detail-column">${this.renderLeaderboard(run)}<section class="run-achievements"><h3>SESSION ACHIEVEMENTS</h3><ol>${achievementRows}</ol></section><section class="run-top-tricks"><h3>HIGHEST SCORING TRICK MOMENTS</h3><ol>${topRows}</ol></section><section class="run-highlights"><span class="session-eyebrow">THE HIGHLIGHT REEL</span><p>${canReplay?`${highlightCount} best scored moment${highlightCount===1?'':'s'} · cinematic cameras & slow motion`:'Land a scored trick to capture your highlights.'}</p><small>${canReplay?'2.5 seconds before and after each moment, where the session allows.':'Highlights are recorded during this session only.'}</small></section></div></div>
      <footer class="run-results-actions">${this.button('RUN IT AGAIN · 90 SEC','restart')}${this.button('CHANGE RIDER / SPOT','start')}${this.button('PRACTICE','practice')}${this.button('MAIN MENU','title')}</footer></article>`;
  }
  renderScoreBreakdown(run){
    const score=run.scoreBreakdown;
    if(!score)return '';
    const multiplier=(number(score.multiplierPercent)/100).toFixed(2);
    const varietyCap=number(score.uniqueTrickCount)*RUN_SCORE_RULES.percentPerUniqueTrick>RUN_SCORE_RULES.maxVarietyBonusPercent;
    const row=(label,detail,value,kind='',valueAttribute='')=>`<div class="run-score-row ${kind}"><dt><strong>${label}</strong>${detail?`<small>${detail}</small>`:''}</dt><dd${valueAttribute?` ${valueAttribute}`:''}>${value}</dd></div>`;
    const rows=[
      row('POINTS BANKED','Score earned during the session',points(score.bankedScore),'','data-banked-score'),



      row('UNIQUE TRICKS',`${points(score.uniqueTrickCount)} different tricks · +${points(score.varietyBonusPercent)}%${varietyCap?' · cap reached':''}`,`×${multiplier}`,'is-bonus','class="score-multiplier"'),
      row('WEIGHTED SCORE',`${points(score.subtotal)} × ${multiplier} · rounded to whole points`,points(score.weightedScore),'is-subtotal'),
      row('BAILS',`${points(score.bails)} × ${points(RUN_SCORE_RULES.pointsPerBail)} point penalty`,`${number(score.bailPenalty)>0?'−':''}${points(score.bailPenalty)}`,'is-penalty'),
      row('FINAL SCORE','Weighted score − bail penalties',points(score.finalScore),'is-final')
    ].join('');
    return `<details class="run-score-breakdown" aria-label="Final score calculation"><summary>HOW YOUR RUN ADDS UP</summary><dl>${rows}</dl><p class="run-score-rule">Trick variety boosts the subtotal up to ×${((100+RUN_SCORE_RULES.maxVarietyBonusPercent)/100).toFixed(2)}. Bails subtract points after the multiplier. Final score never falls below zero. Record rules: ${safe(RUN_SCORE_RULES.version)}.</p></details>`;
  }
  renderPersonalBest(run){
    const pb=run.parkRecord;if(!pb)return '';
    const change=pb.firstRun?'First record for these scoring rules':`${pb.delta>=0?'+':''}${points(Math.abs(pb.delta))} ${pb.delta<0?'below':'over'} previous best`;
    return `<div class="run-personal-best"><strong>${pb.isNewBest?'NEW PARK BEST':`PARK BEST · ${points(pb.score)}`}</strong><p>${change}</p></div>`;
  }
  finishRun(){
    if(['timeup','results','highlights'].includes(this.phase))return;
    this.finalScore=number(this.actions.score());
    this.actions.pause(true);
    this.runSummary=this.actions.finishRun?.()||{totalScore:this.finalScore,durationSeconds:90};
    this.finalScore=number(this.runSummary.finalScore??this.runSummary.totalScore??this.finalScore);
    this.timeupStartedAt=performance.now();
    this.timeupEndsAt=this.timeupStartedAt+(!this.timeupSeen||this.runSummary.parkRecord?.isNewBest?3000:1400);
    this.timeupSeen=true;this.actions.cue?.('roundOver');this.music.duck(900,.5);
    this.setScreen('timeup');
  }
  showResults(){this.setScreen('results');}
  updateReplayCaption(){
    const status=this.actions.replayStatus?.();
    if(!status)return;
    const text=`${number(status.index)+1} / ${number(status.total)||Math.min(3,this.runSummary?.highlights?.length||0)} · ${status.label||'Best moment'}${status.points?` · ${points(status.points)} PTS`:''}`;
    if(text===this.replayDisplayKey)return;
    this.replayDisplayKey=text;
    const caption=this.content.querySelector('[data-replay-caption]');
    if(caption)caption.textContent=text;
  }
  begin(practice=false){
    // The loadout does not need the park: pick a rider while it finishes loading.
    if(this.loadError)return;
    if(this.phase!=='select')this.pendingSelection={returnScreen:this.phase,selection:this.selection,
      heroIndex:this.heroIndex,boardIndex:this.boardIndex,locationIndex:this.locationIndex,finishIndex:this.finishIndex,
      heroConfirmed:this.heroConfirmed,boardConfirmed:this.boardConfirmed};
    this.pendingMode=practice?'practice':'timed';
    this.selectError='';
    // Every visit to the loadout rolls random wheels and a random crew deck art
    // (never "none"); the player can still change both before starting.
    if(this.phase!=='select'){
      const roll=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
      this.boardStyle={...(this.boardStyle||readBoardStyle()),wheels:roll(1,WHEELS.length-1),graphic:roll(1,GRAPHICS.length-1)};
      saveBoardStyle(this.boardStyle);
      this.actions?.boardStyle?.(this.boardStyle);
    }
    // Quick start: the first loadout of a visit pre-selects The Hollow, the
    // Grey deck and Skate Paradise; later visits keep the player's last picks.
    if(!this.loadoutDefaultsApplied){
      this.loadoutDefaultsApplied=true;
      const hollow=(this.heroes||[]).findIndex(hero=>hero.id==='hollow');
      if(hollow>=0)this.heroIndex=hollow;
      // A deck the player saved before wins; new players start on Grey.
      const grey=BOARD_CHOICES.findIndex(board=>board.id==='grey');
      this.boardIndex=this.hasSavedFinish?this.finishIndex:Math.max(0,grey);
      const paradise=LOCATIONS.findIndex(spot=>spot.id==='skate-paradise');
      if(paradise>=0)this.locationIndex=paradise;
    }
    // Everything is already chosen, so LET'S SKATE works at once (A / Enter).
    this.heroConfirmed=true;this.boardConfirmed=true;
    this.focusHint={action:'confirmLoadout',index:0};
    this.setScreen('select');
  }
  heroKey(hero){return hero.art||hero.url||hero.id||'';}
  /** Rider stage: the crew's own art with an entrance animation, or the 3D preview for imported riders. */
  stagePortrait(hero){
    if(hero.art)return `<span class="rider-portrait rider-art-stage" data-hero-key="${safe(this.heroKey(hero))}" data-preview-state="ready"><span class="rider-art-burst" aria-hidden="true"></span><img class="rider-art" src="${safe(hero.art)}" alt="" draggable="false"><span class="rider-art-dust" aria-hidden="true"></span></span>`;
    return `<span class="rider-portrait" data-hero-key="${safe(this.heroKey(hero))}" data-portrait-url="${safe(hero.url)}" data-preview-state="loading"><span class="preview-status">Loading preview…</span></span>`;
  }
  /** Wheel colour and deck-art choices under the deck colours. */
  boardStyleRows(){
    const style=this.boardStyle||=readBoardStyle();
    const row=(action,label,list,chip)=>`<div class="board-style-row" data-style-row="${action}"><span class="board-style-label">${label}</span><div class="board-style-chips">${
      list.map((item,i)=>`<button data-menu data-action="${action}" data-index="${i}" class="board-style-chip ${style[action]===i?'is-chosen':''}" aria-pressed="${style[action]===i}" title="${safe(item.label)}">${chip(item)}</button>`).join('')}</div></div>`;
    const swatch=item=>item.color?`<i style="--chip:${item.color}"${item.camo?' class="camo"':''}></i>`:'<i class="stock"></i>';
    return `<div class="board-style">${row('wheels','WHEELS',WHEELS,item=>`${swatch(item)}<b>${safe(item.label)}</b>`)}${
      row('graphic','DECK ART',GRAPHICS,item=>item.art?`<img src="${safe(gameAssetUrl(item.art))}" alt="" draggable="false"><b>${safe(item.label)}</b>`:`<i class="${item.id}"></i><b>${safe(item.label)}</b>`)}</div>`;
  }
  updateBoardStyleRows(){
    const style=this.boardStyle||readBoardStyle();
    for(const button of this.content?.querySelectorAll?.('.board-style-chip')||[]){
      const chosen=style[button.dataset.action]===Number(button.dataset.index);
      button.classList.toggle('is-chosen',chosen);button.setAttribute('aria-pressed',String(chosen));
    }
  }
  /** Top 10 for this map, with this run highlighted. */
  renderLeaderboard(run){
    const board=run?.leaderboard;
    if(!board?.entries?.length)return '';
    const date=value=>{try{return new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short'});}catch{return '';}};
    const rows=board.entries.map((e,i)=>`<li class="${e.current?'is-current':''}"><span class="lb-rank">${i+1}</span><strong>${Math.round(e.score).toLocaleString('en-US')}</strong><span class="lb-rider">${safe(e.rider)}</span><span class="lb-deck">${safe(e.deck)}</span><span class="lb-date">${safe(date(e.date))}</span></li>`).join('');
    return `<section class="run-leaderboard"><h3>TOP 10 · ${safe(run.mapName||'')}</h3>${board.rank?`<p class="lb-placed">YOU PLACED #${board.rank}</p>`:''}<ol>${rows}</ol></section>`;
  }
  loadPortrait(el){
    const url=el.dataset.portraitUrl;
    if(!url)return;
    characterPortrait(url).then(image=>{
      if(!el.isConnected||el.dataset.portraitUrl!==url)return;
      const thumb=document.createElement('img');
      thumb.src=image;thumb.alt='';thumb.draggable=false;
      el.replaceChildren(thumb);
      el.dataset.previewState='ready';
    }).catch(()=>{
      if(!el.isConnected||el.dataset.portraitUrl!==url)return;
      el.dataset.previewState='unavailable';
      const status=el.querySelector('.preview-status');
      if(status)status.textContent='Preview unavailable';
    });
  }
  loadPortraits(){
    for(const el of this.content.querySelectorAll('[data-portrait-url]'))this.loadPortrait(el);
  }
  updateLoadoutSelection(action,index){
    const hero=this.heroes[this.heroIndex],board=BOARD_CHOICES[this.boardIndex],spot=LOCATIONS[this.locationIndex];
    const root=this.content;
    // Keep headings, decoded glyphs, previews and scroll position mounted when
    // changing a selection; rebuilding the menu briefly exposes fallback text.
    for(const [kind,selected,confirmed] of [['hero',this.heroIndex,this.heroConfirmed],['board',this.boardIndex,this.boardConfirmed],['location',this.locationIndex,true]]){
      for(const button of root.querySelectorAll(`[data-action="${kind}"]`)){
        const chosen=confirmed&&Number(button.dataset.index)===selected;
        button.classList.toggle('is-chosen',chosen);
        button.setAttribute('aria-pressed',String(chosen));
      }
    }
    const rider=root.querySelector('.selected-rider');
    rider.style.setProperty('--rider-accent',hero.accent);
    rider.querySelector('.rider-stage-number').textContent=String(this.heroIndex+1).padStart(2,'0');
    rider.querySelector('.selected-rider-copy span').textContent=this.heroConfirmed?'YOUR RIDER':'MEET THE CREW';
    rider.querySelector('.selected-rider-copy strong').textContent=hero.name;
    rider.querySelector('.selected-rider-copy small').textContent=this.heroSubtitle(hero);
    const portrait=rider.querySelector('.rider-portrait');
    // Picking a rider (even the same one again) replays the stage entrance.
    if(action==='hero'||portrait?.dataset.heroKey!==this.heroKey(hero)){
      const holder=document.createElement('span');
      holder.innerHTML=this.stagePortrait(hero);
      const next=holder.firstElementChild;
      if(portrait)portrait.replaceWith(next);else rider.querySelector('.rider-stage-number').after(next);
      if(next.dataset.portraitUrl)this.loadPortrait(next);
    }
    root.querySelector('.deck-panel .selection-note span').textContent=this.boardConfirmed?'DECK LOCKED IN':'CHOOSE YOUR FINISH';
    root.querySelector('.deck-panel .selection-note strong').textContent=board.label;
    root.querySelector('.spot-panel .selection-note strong').textContent=`MAP ${spot.number} / ${spot.name}`;
    const checks=root.querySelectorAll('.loadout-checks > span');
    for(const [el,confirmed,label,prefix] of [[checks[0],this.heroConfirmed,'RIDER','01'],[checks[1],this.boardConfirmed,'DECK','02']]){
      el.classList.toggle('complete',confirmed);el.textContent=`${confirmed?'✓':prefix} ${label}`;
    }
    root.querySelector('[data-recap-rider]').textContent=hero.name;
    root.querySelector('[data-recap-deck]').textContent=board.label;
    root.querySelector('[data-recap-spot]').textContent=`MAP ${spot.number}`;
    const start=root.querySelector('[data-action="confirmLoadout"]');
    start.disabled=this.selectBusy||!this.heroConfirmed||!this.boardConfirmed;
    if(start.textContent!==this.loadoutStartLabel())start.textContent=this.loadoutStartLabel();
    root.querySelector('.loadout-status').textContent=this.loadoutStatus();
    const button=root.querySelector(`[data-action="${action}"][data-index="${index}"]`);
    const selection=this.menuButtons().indexOf(button);
    if(selection>=0){this.selection=selection;this.focusSelection(false);}
  }
  loadBoardPreviews(){
    const elements=[...this.content.querySelectorAll('[data-board-preview]')];
    boardPortraits().then(previews=>{
      for(const el of elements) if(el.isConnected){
        const image=document.createElement('img');image.src=previews[Number(el.dataset.boardPreview)];image.alt='';image.draggable=false;el.replaceChildren(image);
      }
    }).catch(()=>{});
  }
  setLocation(id,testMapName=null){const index=LOCATIONS.findIndex(spot=>spot.id===id);if(index>=0)this.locationIndex=index;this.testMapName=testMapName;this.root.dataset.location=id;}
  async uploadTestMap(file){
    if(this.phase!=='creator'||!this.ready||this.mapUploadBusy)return;
    const generation=++this.mapUploadGeneration;
    const hero=DEFAULT_CHARACTERS[Math.floor(Math.random()*DEFAULT_CHARACTERS.length)];
    const board=BOARD_CHOICES[Math.floor(Math.random()*BOARD_CHOICES.length)];
    this.mapUploadBusy=true;this.mapUploadStatus='READING LOCAL MAP…';this.render();
    try{
      const result=await this.actions.testMap({file,hero,board,onProgress:message=>{
        if(generation===this.mapUploadGeneration&&this.phase==='creator'){this.mapUploadStatus=message;this.render();}
      }});
      if(!result||generation!==this.mapUploadGeneration||this.phase!=='creator')return;
      this.heroIndex=this.heroes.findIndex(h=>h.id===hero.id);this.boardIndex=board.finishIndex;this.finishIndex=board.finishIndex;
      this.mapUploadBusy=false;this.mapUploadStatus='';this.pendingMode=null;this.tutorialSeen=true;
      this.start(true);
    }catch(error){
      if(generation!==this.mapUploadGeneration||this.phase!=='creator')return;
      this.mapUploadBusy=false;this.mapUploadStatus=error?.message||'Could not load this map.';this.render();
    }
  }
  async confirmLoadout(){
    if(this.selectBusy||!this.ready||this.phase!=='select')return;
    const hero=this.heroes[this.heroIndex];
    const board=BOARD_CHOICES[this.boardIndex];
    const location=LOCATIONS[this.locationIndex];
    if(!this.heroConfirmed||!this.boardConfirmed||!hero||!location?.available)return;
    const generation=++this.loadoutGeneration;
    this.selectBusy=true;this.selectError='Loading '+hero.name+'…';this.render();
    try{
      await this.actions.loadout({hero,board,location});
      if(generation!==this.loadoutGeneration||this.phase!=='select')return;
      this.selectBusy=false;this.selectError='';
      this.updateLoadingOverlay();
      this.finishIndex=board.finishIndex;
      this.tutorialSeen=true;
      const practice=this.pendingMode==='practice';
      this.pendingMode=null;
      this.pendingSelection=null;
      this.start(practice);
    }catch(error){
      if(generation!==this.loadoutGeneration||this.phase!=='select')return;
      this.selectBusy=false;
      this.selectError='Cannot load '+hero.name+': '+(error?.message||'Invalid or missing GLB.');
      this.render();
    }
  }
  start(practice){
    this.practice=practice;this.remaining=90;this.inputGrace=.3;this.runSummary=null;this.timeupEndsAt=0;
    this.sessionFlow.begin({practice});this.goRemaining=0;
    this.music.unlock();this.setScreen('playing');this.actions.start(practice);
    if(!practice)this.actions.cue?.('ready');this.actions.camera(CAMERA_MODES[this.cameraIndex]);
  }
  pause(){if(this.active){this.setScreen('pause');this.actions.pause(true);}}
  resume(){this.setScreen('playing');this.inputGrace=.18;this.actions.pause(false);}
  syncPause(value){if(value&&this.active)this.setScreen('pause');else if(!value&&this.phase==='pause')this.setScreen('playing');}
  openTutorial(){this.tutorialReturn=this.phase;this.page=0;this.flipTutorial=true;this.actions.pause(true);this.setScreen('flipSchool');}
  openFlipSchool(){this.flipReturn=this.phase;this.flipTutorial=false;this.actions.pause(true);this.setScreen('flipSchool');}
  closeFlipSchool(){if(this.flipTutorial){this.flipTutorial=false;this.closeTutorial();}else if(this.flipReturn==='playing')this.resume();else this.setScreen(this.flipReturn||'title');}
  closeTutorial(){
    this.tutorialSeen=true;
    // Tutorials interrupt a screen; they never bypass loadout confirmation.
    if(this.tutorialReturn==='playing')this.resume();
    else this.setScreen(this.tutorialReturn==='tutorial'?'title':this.tutorialReturn);
  }
  cancelSelection(){
    const pending=this.pendingSelection;
    this.pendingSelection=null;this.pendingMode=null;this.selectError='';
    if(pending){for(const key of ['heroIndex','boardIndex','locationIndex','finishIndex','heroConfirmed','boardConfirmed'])this[key]=pending[key];}
    this.setScreen(pending?.returnScreen||'title');
    if(pending){this.selection=pending.selection||0;this.focusSelection();}
  }
  back(){if(this.phase==='flipSchool'){this.closeFlipSchool();return;}if(this.phase==='timeup'){this.skipTimeup();return;}else if(this.phase==='highlights')this.showResults();else if(this.phase==='tutorial'){this.closeTutorial();}else if(this.phase==='options')this.setScreen(this.optionsReturn||'title');else if(['graphics','settings','creator'].includes(this.phase))this.setScreen('options');else if(this.phase==='pause')this.resume();else if(this.phase==='results')this.choose('title');else if(this.phase==='select')this.cancelSelection();else if(this.phase==='title')this.choose('launcher');}
  choose(action,index=0){
    if(this.phase==='timeup'){this.skipTimeup();return;}
    this.actions.cue?.(action==='back'?'back':'confirm');
    this.music.unlock();
    if(this.selectBusy&&['hero','board','location','upload','confirmLoadout'].includes(action))return;
    switch(action){
      // Same game-selection destination used by CyberArtsBR/Skate's launcher.
      case 'launcher':window.location.assign('https://chimp-jump.onrender.com/');break;
      case 'start':this.begin(false);break;case 'practice':this.begin(true);break;
      case 'hero':this.heroIndex=index;this.heroConfirmed=true;this.updateLoadoutSelection(action,index);break;
      case 'board':this.boardIndex=index;this.boardConfirmed=true;this.updateLoadoutSelection(action,index);break;
      case 'wheels':case 'graphic':
        this.boardStyle={...(this.boardStyle||readBoardStyle()),[action]:index};saveBoardStyle(this.boardStyle);
        this.actions.boardStyle?.(this.boardStyle);this.updateBoardStyleRows();break;
      case 'location':if(LOCATIONS[index]?.available){this.locationIndex=index;this.updateLoadoutSelection(action,index);}break;
      case 'upload':this.avatarInput.click();break;
      case 'confirmLoadout':void this.confirmLoadout();break;
      case 'restart':this.start(this.practice);break;case 'resume':this.resume();break;
      case 'practiceDrills':if(this.phase==='pause'&&this.practice){this.actions.toggleDrills?.();this.render();}break;
      case 'practiceInputs':if(this.phase==='pause'&&this.practice){this.actions.togglePracticeInputs?.();this.render();}break;
      case 'watchHighlights':if(this.actions.watchHighlights?.()){this.replayDisplayKey='';this.setScreen('highlights');this.updateReplayCaption();}break;
      case 'stopHighlights':this.showResults();break;
      case 'tutorial':this.openTutorial();break;
      case 'flipSchool':this.openFlipSchool();break;
      case 'tutorialNext':this.page=0;this.setScreen('tutorial');break;
      case 'flipLesson':this.flipLessonIndex=Math.max(0,Math.min(FLIP_LESSONS.length-1,index));this.focusHint={action:'flipLesson',index:this.flipLessonIndex};this.render();break;
      case 'flipInput':this.flipInputMode=['xbox','playstation','keyboard'][index]||'xbox';this.flipPlayer?.setInputMode(this.flipInputMode);break;
      case 'flipPlay':this.flipPlayer?.toggle();break;
      case 'flipReplay':this.flipPlayer?.replay();break;
      case 'flipSpeed':this.flipPlayer?.toggleSpeed();break;
      case 'settings':this.setScreen('settings');break;
      case 'creator':this.setScreen('creator');break;
      case 'flipTry':this.start(true);this.actions.tryTrick?.(FLIP_LESSONS[this.flipLessonIndex]);break;
      case 'options':this.optionsReturn=this.phase;this.setScreen('options');break;
      case 'uploadTestMap':if(this.ready&&!this.mapUploadBusy)this.mapInput.click();break;
      case 'camera':this.cameraIndex=(this.cameraIndex+1)%CAMERA_MODES.length;persist('streetskate.camera',CAMERA_MODES[this.cameraIndex]);this.actions.camera(CAMERA_MODES[this.cameraIndex]);this.render();break;
      case 'deadZone':{const current=this.actions.getDeadZone?.() ?? .16;const next=STICK_DEAD_ZONES[(STICK_DEAD_ZONES.indexOf(current)+1)%STICK_DEAD_ZONES.length];this.actions.setDeadZone?.(next);persist('streetskate.stickDeadZone',next);this.render();break;}
      case 'graphicsMenu':this.setScreen('graphics');break;
      case 'graphicsSet':this.graphicsIndex=Math.max(0,Math.min(GRAPHICS_PRESET_ORDER.length-1,index));this.actions.graphics?.(GRAPHICS_PRESET_ORDER[this.graphicsIndex]);this.render();break;
      case 'bloomToggle':this.bloomEnabled=!this.bloomEnabled;persist('streetskate.bloomEnabled',this.bloomEnabled?'on':'off');this.actions.graphics?.(GRAPHICS_PRESET_ORDER[this.graphicsIndex]);this.render();break;
      case 'glowAdjust':{
        const control=GLOW_CONTROLS[Math.floor(index/2)];
        const current=control&&this.actions.graphicsStatus?.()?.glowTuning?.[control.key];
        if(control&&Number.isFinite(current)) {
          const value=stepGlowValue(control,current,index%2?1:-1);
          this.updateGlowControls(this.actions.graphicsGlow?.(control.key,value),'Saved for this preset.');
        }
        break;
      }
      case 'glowReset':this.updateGlowControls(this.actions.graphicsGlowReset?.(),'Preset glow restored.');break;
      case 'edgeToggle':this.smoothEdges=!this.smoothEdges;persist('streetskate.smoothEdges',this.smoothEdges?'on':'off');this.actions.graphics?.(GRAPHICS_PRESET_ORDER[this.graphicsIndex]);this.render();break;
      case 'musicDown':this.adjustVolume('music',-.1);break;
      case 'musicUp':this.adjustVolume('music',.1);break;
      case 'effectsDown':this.adjustVolume('effects',-.1);break;
      case 'effectsUp':this.adjustVolume('effects',.1);break;
      case 'sound':this.sound=!this.sound;persist('streetskate.sound',this.sound?'on':'off');this.actions.sound(this.sound);this.render();break;
      case 'deck':this.finishIndex=(this.finishIndex+1)%BOARD_CHOICES.length;this.actions.deck(this.finishIndex);this.render();break;
      case 'title':this.actions.pause(true);this.setScreen('title');break;
      case 'back':this.back();break;
      case 'previous':if(this.page===0){this.flipTutorial=true;this.setScreen('flipSchool');}else{this.page--;this.render();}break;
      case 'next':this.page=Math.min(this.pages.length-1,this.page+1);this.render();break;
      case 'closeTutorial':this.closeTutorial();break;
      case 'skipTutorial':this.closeTutorial();break;
    }
  }
  adjustVolume(channel,step){
    const current=channel==='music'?this.music.musicVolume:this.effectsVolume;
    const value=Math.round(Math.max(0,Math.min(1,current+step))*100)/100;
    if(channel==='music')this.music.setMusicVolume(value);
    else { this.effectsVolume=saveAudioVolume('effects',value);this.actions.effectsVolume?.(value); }
    this.render();
  }
  skipTimeup(){if(this.phase==='timeup'&&performance.now()-this.timeupStartedAt>=450)this.showResults();}
  skipReady(){if(!this.active||!this.sessionFlow.skipReady())return false;this.inputGrace=.25;this.actions.clearInput?.();return true;}
  updateRoundCue(){
    if(!this.roundCue)return;const phase=this.sessionFlow.phase;
    this.roundCue.hidden=!this.active||!(phase==='ready'||phase==='overtime'||this.goRemaining>0);
    this.roundCue.dataset.phase=phase;
    // Graffiti cue, in the same lettering as the trick callouts.
    const seconds=Math.ceil(this.sessionFlow.overtimeRemaining);
    const key=phase==='ready'?'ready':phase==='overtime'?`overtime-${seconds}`:'go';
    if(this.roundCue.dataset.cue===key)return;
    this.roundCue.dataset.cue=key;
    const [word,palette,sub]=phase==='ready'?['READY','gold','ENTER / A TO GO']:phase==='overtime'?['LAST COMBO','red',`LAND IT · ${seconds}`]:['GO','green',''];
    this.roundCue.setAttribute('aria-label',phase==='ready'?'Ready. Enter or A to go':phase==='overtime'?`Finish this combo, ${seconds} seconds`:'Go');
    this.roundCue.innerHTML=`<span class="round-cue-word">${graffitiLettering(word,palette)}</span>${sub?`<small>${sub}</small>`:''}`;
  }
  key(event){
    if(this.settingsPanel?.capturing)return;
    if(this.active&&this.sessionFlow?.phase==='ready'&&['Enter','Space'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)this.skipReady();return;}
    if(/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName))return;
    if(this.phase==='timeup'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat&&['Enter','Space','Escape'].includes(event.code))this.skipTimeup();return;}
    if(this.phase==='highlights'&&event.code==='KeyH'){event.preventDefault();event.stopImmediatePropagation();return;}
    if(event.code==='Backspace'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)this.music.next();return;}
    if(event.code==='KeyH'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat){if(this.open)this.closeTutorial();else if(this.phase==='flipSchool')this.closeFlipSchool();else this.openTutorial();}return;}
    if(this.active)return;
    this.music.unlock();
    if(event.target?.tagName==='SUMMARY'&&['Enter','Space'].includes(event.code))return;
    if(event.code==='Tab'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      // Include native disclosures as well as actions; their Enter/Space behavior
      // stays native so rendering details remain keyboard-accessible.
      const buttons=this.content?[...this.content.querySelectorAll('button[data-menu]:not(:disabled),summary')].filter(availableMenuTarget):this.menuButtons();
      if(!buttons.length)return;
      event.preventDefault();event.stopImmediatePropagation();
      const current=buttons.indexOf(document.activeElement);
      const next=current<0?(event.shiftKey?buttons.length-1:0):(current+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
      const target=buttons[next];target.focus({preventScroll:true});
      target.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'auto'});return;
    }
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','Enter','Escape'].includes(event.code)){
      event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
      if(event.code==='Escape')this.back();
      else if(['ArrowLeft','KeyA'].includes(event.code)&&this.open)this.choose('previous');
      else if(['ArrowRight','KeyD'].includes(event.code)&&this.open)this.choose('next');
      else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(event.code)){
        const axis=['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(event.code)?'x':'y';
        this.moveSelection(axis,['ArrowUp','ArrowLeft','KeyW','KeyA'].includes(event.code)?-1:1);
      }
      else if(event.code==='Enter'||event.code==='Space')this.menuButtons()[this.selection]?.click();
    }
  }
  updateTimer(){
    const warn=sessionWarning(this.remaining,this.practice);
    const text=this.practice?'∞':`${Math.floor(Math.ceil(this.remaining)/60)}:${String(Math.ceil(this.remaining)%60).padStart(2,'0')}`;
    if(this.timer.textContent===text&&this.timer.dataset.timerWarning===warn)return;
    setHudGlyphValue(this.timerValue,text);this.timer.dataset.timerWarning=warn;
    this.timer.dataset.practice=String(this.practice);
    this.timer.setAttribute('aria-label',this.practice?'Free skate · no time limit':`Time remaining ${text}`);
    this.timer.classList.toggle('time-low',warn!=='none');
    this.timer.classList.toggle('time-critical',warn==='critical');
    this.timer.dataset.warningLabel=warn==='critical'?'FINAL 5 SECONDS':warn==='warning'?'10 SECONDS LEFT':'';
  }
  /**
   * Menu direction from the left stick: the stronger axis wins, so a slightly
   * diagonal push up still means up. Engages past .5, lets go below .3.
   */
  stickDirection(x,y){
    const strength=Math.max(Math.abs(x),Math.abs(y));
    if(strength<.3)this.stickHeld=null;
    else if(strength>.5)this.stickHeld=Math.abs(y)>=Math.abs(x)?(y<0?'up':'down'):(x<0?'left':'right');
    return this.stickHeld||null;
  }
  update(dt){
    if(this.phase==='timeup'&&performance.now()>=this.timeupEndsAt)this.showResults();
    if(this.phase==='highlights')this.updateReplayCaption();
    this.inputGrace=Math.max(0,this.inputGrace-dt);this.navRepeat=Math.max(0,this.navRepeat-dt);
    if(this.active&&this.songToastRemaining>0){
      this.songToastRemaining=Math.max(0,this.songToastRemaining-dt);
      if(!this.songToastRemaining&&this.song.querySelector('.song-note').hidden)this.song.classList.add('song-compact');
    }
    const focused=document.hasFocus();
    const pad=[...(navigator.getGamepads?.()||[])].find(p=>p?.connected);
    const padIdentity=pad ? String(pad.index)+':'+String(pad.id) : null;
    const padChanged=padIdentity!==this.padIdentity;
    this.padIdentity=padIdentity;
    const b=i=>!!pad?.buttons[i]?.pressed;
    const stick=this.stickDirection(pad?.axes?.[0]||0,pad?.axes?.[1]||0);
    const keys={a:b(0),back:b(1),select:b(8),start:b(9),
      shoulderLeft:b(4),shoulderRight:b(5),
      up:b(12)||stick==='up',down:b(13)||stick==='down',
      left:b(14)||stick==='left',right:b(15)||stick==='right'};
    // Read the physical state even when unfocused so regaining focus cannot
    // synthesize a stale edge from a button held while the tab was inactive.
    if(!focused){this.padFocused=false;this.previousPad=keys;this.navRepeat=.22;return;}
    if(!this.padFocused||padChanged){this.previousPad=keys;this.padFocused=true;}
    const edge=k=>keys[k]&&!this.previousPad[k];
    const capturing=this.settingsPanel?.capturing;this.settingsPanel?.update();
    if(capturing){this.previousPad=keys;return;}
    if(this.phase==='timeup'&&(edge('a')||edge('start')||edge('back'))){
      this.skipTimeup();this.previousPad=keys;return;
    }
    if(this.active&&this.sessionFlow.phase==='ready'&&(edge('a')||edge('start')))this.skipReady();
    if(Object.keys(keys).some(edge))this.music.unlock();
    if(edge('select'))this.music.next();
    if(!this.active&&this.phase!=='timeup'){
      const direction=keys.left?'left':keys.right?'right':keys.up?'up':keys.down?'down':null;
      if(this.open){
        if(edge('back'))this.back();
        else if(edge('start'))this.choose('skipTutorial');
        else if(edge('shoulderLeft')||edge('left'))this.choose('previous');
        else if(edge('shoulderRight')||edge('right'))this.choose('next');
        else if(direction&&(direction==='up'||direction==='down')&&(!this.navRepeat||edge(direction))){
          this.moveSelection('y',direction==='up'?-1:1);this.navRepeat=.22;
        }
        else if(edge('a'))this.menuButtons()[this.selection]?.click();
      } else {
        if(direction&&(!this.navRepeat||edge(direction))){
          this.moveSelection(direction==='left'||direction==='right'?'x':'y',
            direction==='left'||direction==='up'?-1:1);
          this.navRepeat=.22;
        }
        if(edge('back'))this.back();
        else if(edge('a'))this.menuButtons()[this.selection]?.click();
        else if(edge('start')&&this.phase==='pause')this.resume();
        else if(edge('start')&&this.phase==='title')this.begin(false);
      }
    }
    this.previousPad=keys;
    if(this.active&&document.hasFocus()){
      const before=this.remaining;
      const flow=this.sessionFlow.update(dt,this.actions.attemptState?.()||{});
      this.remaining=flow.remaining;this.goRemaining=Math.max(0,this.goRemaining-dt);
      for(const event of flow.events){
        if(event==='go'){this.goRemaining=.65;this.inputGrace=.25;this.actions.clearInput?.();this.actions.cue?.('go');}
        if(event==='overtime'){this.actions.overtime?.();this.music.duck(500,.65);}
        if(event==='finish')this.finishRun();
      }
      this.updateRoundCue();this.updateTimer();
      const threshold=countdownCrossing(before,this.remaining,this.practice);
      if(threshold){this.actions.countdownWarning?.(threshold);this.music.duck(500,.65);}
    }
  }
}
