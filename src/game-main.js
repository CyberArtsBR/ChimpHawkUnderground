import { surfaceTagFor } from './game/SurfaceAudio.js';
import { installModuleLoadRecovery } from './game/ModuleLoadRecovery.js';
import { freezeStaticParkTransforms } from './graphics/StaticParkTransforms.js';
import { warmScenePrograms, renderGameplayWarmup } from './graphics/ShaderWarmup.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { StreetSkater } from './game/StreetSkater.js';
import { SkateInput } from './input/SkateInput.js';
import { FollowCamera } from './game/FollowCamera.js';
import { CAMERA_MODES, CAMERA_LABELS, CAMERA_SHORTCUTS } from './game/CameraModes.js';
import { createDebugOverlay, captureAuditTelemetry } from './game/DebugOverlay.js';
import { captureGameplayState } from './game/core/GameplayStateSnapshot.js';
import { TransitionDebugVisualizer, transitionDebugSummary } from './game/transitions/TransitionDebugVisualizer.js';
import { createParkWorld, prepareParkRuntime, bindParkRuntime, disposeParkWorld } from './game/ParkRegistry.js';
import { createTestMapWorld } from './game/TestMapLoader.js';
import { SkateAudio } from './game/SkateAudio.js';
import { SKATEBOARD_FINISHES } from './skateboard/BoardFinishes.js';
import { loadSolarSky, createCloudBackdrop } from './park/SolarSky.js';
import { GameShell } from './game/GameShell.js';
import { CopingTrace } from './game/CopingTrace.js';
import { RunSummary } from './game/RunSummary.js';
import { sessionAttemptState } from './game/SessionFlow.js';
import { ScoreRecords } from './game/ScoreRecords.js';
import { readPlayerPreferences, applyPlayerPreferences } from './game/PlayerPreferences.js';
import { FrameMetrics } from './graphics/FrameMetrics.js';
import { PracticeDrills } from './game/PracticeDrills.js';
import { HighlightRecorder } from './game/HighlightRecorder.js';
import { HighlightPlayback } from './game/HighlightPlayback.js';
import { setHudGlyphValue, preloadHudGlyphs } from './game/HudGlyphs.js';
import { graffitiToneForTrick } from './game/GraffitiTypography.js';
import { graffitiLettering, graffitiPalette, installGraffitiFallback, prepareGraffitiHudGlyphs } from './game/GraffitiLettering.js';
import { fitGraffitiHud } from './game/GraffitiHudLayout.js';
import { GraphicsPipeline } from './graphics/GraphicsPipeline.js';
import { SkateEffects } from './graphics/SkateEffects.js';
import { WorldLife } from './graphics/WorldLife.js';
import { ComboCallouts } from './game/ComboCallouts.js';
import { SkyLife } from './graphics/SkyLife.js';
import { MapDressing } from './graphics/MapDressing.js';
import { MapAmbience } from './graphics/MapAmbience.js';
import { Rumble } from './game/Rumble.js';
import { applyWorldFinishes, updateFloorFinishTime } from './graphics/FloorFinish.js';
import { FloorReflections } from './graphics/FloorReflections.js';
import { ReactiveMusic } from './game/ReactiveMusic.js';
import { LocalLeaderboard } from './game/LocalLeaderboard.js';
import { GRAPHICS_PRESET_ORDER, loadGraphicsPreset, loadGraphicsPresetFor, storeGraphicsPreset, normalizedGraphicsPreset, qualityFogDistance } from './graphics/GraphicsSettings.js';
import { normalizeGlowOverrides, readGlowPresets, saveGlowPresets, initializeGlowDefaults, useCurrentGlowDefaults } from './graphics/GlowTuning.js';
import './style.css';
import './game-shell.css';
import './loadout-menu.css';
import './game-hud.css';
import './menu-presentation.css';
import './gameplay-instruments.css';
import './session-results.css';
import './menu-graphics.css';
import './flip-school.css';
import './player-settings.css';
import './graphics-glow.css';
import './round-flow.css';
import './menu-skin.css';
import './hud-skin.css';

const container = document.querySelector('#viewport');
installModuleLoadRecovery();
installGraffitiFallback();
const app = document.querySelector('#app');
let sceneNeedsRender=true;
let artCaptureMap=null;
// Cache HUD nodes once; unchanged values need no DOM writes at 144 Hz.
const hud = Object.fromEntries(['speed-value','charge-fill','state-value','score-value','trick-feedback']
  .map(id => [id, document.getElementById(id)]));
preloadHudGlyphs();
setHudGlyphValue(hud['speed-value'], '00');
setHudGlyphValue(hud['score-value'], '0');
// Bitmap score digits must be measured after layout, not just when the font
// CSS is first parsed. This is an event-driven resize, not work at 144 FPS.
const scheduleTrickHudFit = () => requestAnimationFrame(() =>
  fitGraffitiHud(hud['trick-feedback'], innerWidth, innerHeight));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#25363d');
scene.fog = new THREE.FogExp2('#25363d', 0.005);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 5;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.485;
controls.target.set(0, 0, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04);
scene.environment = environment.texture;
scene.environmentIntensity = 0.32;
room.dispose();
pmrem.dispose();

const ambient = new THREE.HemisphereLight('#bce1ff', '#635649', 1.3);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff1d9', 2.8);
sun.position.set(-25, 45, 10);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 45, bottom: -45, near: 1, far: 130 });
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.07;
sun.shadow.radius = 2;
scene.add(sun);
// Broad reflected skylight keeps costumes legible without making them glow.
// One non-shadowed fill is shared by all maps; the key retains the 1024 atlas.
const fill = new THREE.DirectionalLight('#bfd8ff', .4);
fill.name = 'Map skylight fill';
scene.add(fill, fill.target, sun.target);
// Warm light bounced off sunlit ground into the shadow side (maps that ask for it).
const bounce = new THREE.DirectionalLight('#ffa16a', 0);
bounce.name = 'Map ground bounce';
scene.add(bounce, bounce.target);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({ color: '#31454b', roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.18;
floor.receiveShadow = true;
scene.add(floor);

const graphicsPipeline = new GraphicsPipeline(renderer, scene, camera);
const performanceHud=document.createElement('div');performanceHud.className='frame-metrics';performanceHud.hidden=true;app.append(performanceHud);
const frameMetrics=new FrameMetrics(renderer,performanceHud);
let playerPreferences=applyPlayerPreferences(readPlayerPreferences());
frameMetrics.setEnabled(playerPreferences.performance);
const skateEffects = new SkateEffects(scene);
const worldLife = new WorldLife(scene);
graphicsPipeline.setEffectsTarget(skateEffects.root);
let effectsWereActive = false;
const graphicsStorage = (() => { try { return window.localStorage; } catch { return null; } })();
let graphicsPreset = loadGraphicsPresetFor(graphicsStorage, renderer);
let glowPresets = readGlowPresets(graphicsStorage);
let legacyGlowDefaults = initializeGlowDefaults(graphicsStorage);

const views = {
  overview: { position: [66, 62, 80], target: [-1, 0, 0], caption: 'The whole playground', index: '01' },
  bowl: { position: [44, 30, 22], target: [14, -1, -11], caption: 'Connected curves. Continuous flow.', index: '02' },
  street: { position: [31, 17, 37], target: [-4, 1, 7], caption: 'Find your next connection', index: '03' },
  top: { position: [0, 100, 0.01], target: [0, 0, 0], caption: 'Every obstacle. Every possible line.', index: '—' },
};

let tween = null;
let park = null;
let collision = null;
let manifest = null;
let skater = null;
let followCamera = null;
let transitionDebug = null;
let dusk = false;
let solarSky = null;
let skyLoading = null;
let currentWorld = null;
let switchingWorld = false;
let mode = 'skate';
let loaded = false;
let paused = false;
let lastInputState = {};
let loadoutRequest = 0;
const input = new SkateInput(renderer.domElement);
const debugOverlay = new URLSearchParams(location.search).get('debug') === '1' ? createDebugOverlay({
  button: document.querySelector('#debug-overlay'),
  panel: document.querySelector('#debug-panel'),
}) : { update() {}, toggle() {} };
const clock = new THREE.Clock();
const skateAudio = new SkateAudio();
worldLife.setAudio(skateAudio);
const comboCallouts = new ComboCallouts({ audio: skateAudio });
const skyLife = new SkyLife(scene);
const mapDressing = new MapDressing(scene);
const mapAmbience = new MapAmbience(scene);
const floorReflections = new FloorReflections(scene);
graphicsPipeline.reflectionRoot = floorReflections.root;
window.addEventListener('pointerdown', () => skateAudio.unlock(), { passive: true });
window.addEventListener('keydown', () => skateAudio.unlock(), { passive: true });
const legacyPark = new URLSearchParams(location.search).get('park') === 'legacy';
const runSummary = new RunSummary();
const scoreRecords=new ScoreRecords(graphicsStorage);
const leaderboard=new LocalLeaderboard(graphicsStorage);
const rumble=new Rumble();
const reactiveMusic=new ReactiveMusic();
let overtimeFirstRecord=false;
const highlightRecorder = new HighlightRecorder();
let runInProgress = false;
let runFinished = false;
let highlightClips = [];
let highlightStatus = null;
let sessionEventTime = 0;
let comboStartTime = 0;
let pendingReplayMoments = [];
let previousPresentationEvent = null;
let practiceMarker = null;
const practiceDrills = new PracticeDrills();
let practiceInputsEnabled = false, practiceInputText = '', practiceInputTime = 0;
const drillHud = document.createElement('div');
drillHud.className = 'practice-drill';
drillHud.setAttribute('role','status');
drillHud.setAttribute('aria-live','polite');
drillHud.hidden = true;
app.appendChild(drillHud);
const inputHud = document.createElement('div');
inputHud.className = 'practice-input';inputHud.hidden = true;app.appendChild(inputHud);
function updateDrillHud() {
  const visible = practiceDrills.enabled && gameShell.practice && gameShell.active;
  if (drillHud.hidden === visible) drillHud.hidden = !visible;
  if (visible && drillHud.textContent !== practiceDrills.label) drillHud.textContent = practiceDrills.label;
}
const highlightPlayback = new HighlightPlayback({
  camera,
  getSurface: () => collision,
  onFinish: () => gameShell.showResults(),
  onEvent:event=>{skateAudio.playRecordedEvent?.(event);skateEffects.playRecordedEvent?.(event,collision);},
  onAdvance:delta=>{skateEffects.updateReplay(delta);skateAudio.updateReplay?.(delta);},
  onStop:()=>{skateEffects.reset(skater);skateAudio.resetReplay?.();},
  onMoment: moment => { skateEffects.reset();skateAudio.resetReplay?.();highlightStatus = { ...moment, total: moment.count }; },
});
const gameShell = new GameShell({
  input,
  clearInput:()=>input.suppressHeldInputs(),
  attemptState:()=>sessionAttemptState(skater),
  overtime:()=>{overtimeFirstRecord=!skater.tricks.combo.length&&sessionAttemptState(skater).eligibleAttempt;},
  cue:kind=>skateAudio.cue(kind),
  preferences:(partial,all)=>{
    playerPreferences=all;followCamera?.setPreferences(all);sceneNeedsRender=true;
    skateEffects.setLiquidEnabled(all.liquid);frameMetrics.setEnabled(all.performance);
    if(partial.effectsVolume!=null)skateAudio.setEffectsVolume(partial.effectsVolume);
    if(partial.crowdVolume!=null)skateAudio.setCrowdVolume(partial.crowdVolume);
    if(partial.voiceVolume!=null)skateAudio.setVoiceVolume(partial.voiceVolume);
    if(partial.renderScale!=null)applyGraphicsPreset(graphicsPreset);
    if(partial.announcerVolume!=null)skateAudio.setAnnouncerVolume(partial.announcerVolume);
    if(partial.backgroundAudio!=null)skateAudio.setBackgroundAudio(partial.backgroundAudio);
  },
  tryTrick:lesson=>{
    if(!skater?.grounded||skater.bailTime)return;
    practiceMarker={position:skater.position.clone(),heading:skater.heading,stance:skater.stance,location:currentWorld.id};
    practiceDrills.selectTrick(lesson.trick.name,lesson.id);practiceInputsEnabled=true;
    updateDrillHud();
  },
  start: practice => {
    if (!skater) return;
    // Warm the first ollie and its common digits while the session starts.
    prepareGraffitiHudGlyphs('OLLIE501','cyan-purple');
    practiceMarker = null;
    overtimeFirstRecord=false;
    practiceDrills.target = null;
    practiceDrills.reset();
    practiceInputText = ''; practiceInputTime = 0;
    highlightPlayback.stop();
    skater.spawn.set(...manifest.spawn); skater.spawnHeading = Number(manifest.spawnHeading) || 0;
    skater.reset(skater.spawn, skater.spawnHeading);
    setMode('skate'); input.read(); input.clear(); followCamera.snap(skater);
    runSummary.begin({ practice, riderName: gameShell.heroes[gameShell.heroIndex]?.name,
      deckName: gameShell.boardLabel(), mapName: gameShell.locationName() }, skater);
    highlightRecorder.reset(skater);
    runInProgress = true; runFinished = false; highlightClips = []; highlightStatus = null;
    sessionEventTime = 0; comboStartTime = 0; pendingReplayMoments = []; previousPresentationEvent=null;
  },
  pause: value => setPaused(value),
  drillsEnabled: () => practiceDrills.enabled,
  toggleDrills: () => practiceDrills.toggle(),
  practiceInputsEnabled: () => practiceInputsEnabled,
  togglePracticeInputs: () => { practiceInputsEnabled = !practiceInputsEnabled; },
  camera: mode => setCameraMode(mode),
  getDeadZone: () => input.stickDeadZone,
  setDeadZone: value => { input.stickDeadZone = value; },
  graphics: name => applyGraphicsPreset(name),
  graphicsStatus: () => graphicsPipeline.getStatus(),
  audioStatus:()=>skateAudio.getAudioStatus(),
  retryAudio:()=>skateAudio.retryFoley(),
  graphicsGlow: (key,value) => setGlowValue(key,value),
  graphicsGlowReset: () => resetGlowValues(),
  screenChanged: phase => {
    sceneNeedsRender=true;
    if (phase === 'results' && runFinished && !highlightRecorder.finished) {
      highlightClips = highlightRecorder.finish();
      gameShell.runSummary = { ...gameShell.runSummary, highlightsCount: highlightClips.length };
    }
  },
  score: () => skater?.score || 0,
  finishRun: () => {
    if(runFinished)return gameShell.runSummary;
    runInProgress = false; runFinished = true;
    if(gameShell.sessionFlow.finishReason!=='landed')skater?.tricks.cancelCombo();
    const run=runSummary.finish({ totalScore: skater?.score || 0,
      durationSeconds: gameShell.practice ? runSummary.elapsedSeconds : gameShell.sessionFlow.elapsed });
    return {...run,parkRecord:scoreRecords.record(currentWorld.id,run),leaderboard:leaderboard.record(currentWorld.id,run)};
  },
  canWatchHighlights: () => highlightClips.length > 0,
  watchHighlights: () => highlightPlayback.start(highlightClips),
  stopHighlights: () => { highlightPlayback.stop(); skateAudio.silence(); skateEffects.reset(skater); sceneNeedsRender = true; },
  replayStatus: () => highlightStatus,
  countdownWarning: seconds => skateAudio.countdownCue(seconds),
  sound: enabled => setSkateSound(enabled),
  deck: index => skater?.board?.setFinish(index),
  effectsVolume: value => skateAudio.setEffectsVolume(value),
  cancelLoadout: () => { loadoutRequest++; skater?.cancelRiderSwap?.(); },
  loadout: ({hero,board,location}) => selectLocation(location?.id, {hero,finish:board.finishIndex}),
  boardStyle: style => skater?.board?.setStyle?.(style),
  testMap: ({file,hero,board,onProgress}) => selectLocation('test-map', {file,hero,finish:board.finishIndex,onProgress}),
});
skateAudio.onMusicDuck=({durationMs,amount,releaseMs})=>gameShell.music.duck(durationMs,amount,releaseMs);

// Observe the existing score banks without changing scoring or simulation rules.
function observeRunScoring(controller) {
  const scorer = controller.tricks;
  const originalRecord = scorer.record;
  const originalSettle = scorer.settle;
  scorer.record = function (...args) {
    const first = !this.combo.length;
    if(runInProgress&&!gameShell.sessionFlow.snapshot().allowNewCombo&&first&&!overtimeFirstRecord)return null;
    if(runFinished)return null;
    const entry = originalRecord.apply(this, args);
    if(entry)overtimeFirstRecord=false;
    if (runInProgress && entry && first) comboStartTime = sessionEventTime;
    return entry;
  };
  scorer.settle = function (...args) {
    if(this.combo.length&&runInProgress&&!gameShell.sessionFlow.acceptSettlement()){this.cancelCombo();return null;}
    if(runFinished){this.cancelCombo();return null;}
    const entries = runInProgress && this.combo.length ? this.combo.map(entry => ({ ...entry })) : [];
    const durationSeconds = this.comboDuration();
    const result = originalSettle.apply(this, args);
    if (runInProgress && result) {
      if (gameShell.practice){practiceDrills.observe(controller,1/120);practiceDrills.accept(entries);updateDrillHud();}
      const moment = runSummary.recordCombo({ ...result, entries, durationSeconds,
        startTime: comboStartTime, endTime: sessionEventTime });
      if(moment){
        const oldBest=scoreRecords.get(currentWorld.id)?.bestCombo;
        skateAudio.onComboSettled?.({points:moment.points,id:currentWorld.id+':'+sessionEventTime,location:currentWorld.id,
          personalBest:!gameShell.practice&&oldBest>0&&moment.points>oldBest});
        comboCallouts.show(moment.points);
        // Big landed combos get a celebration from the rider.
        if(moment.points>=2500)skater?.rider?.gesture?.('celebrate',Math.min(1,.6+moment.points/12000));
        if(moment.points>=1200){const node=document.getElementById('trick-feedback');node?.classList.remove('exceptional-line');
          requestAnimationFrame(()=>node?.classList.add('exceptional-line'));}
      }
      if (moment) pendingReplayMoments.push({ start: moment.startTime, end: moment.endTime,
        points: moment.points, label: moment.label });
    }
    return result;
  };
}
setSkateSound(skateAudio.enabled);

// Both menu and toolbar controls represent the same persisted audio state.
function setSkateSound(enabled) {
  if (skateAudio.enabled !== Boolean(enabled)) skateAudio.toggle();
  gameShell.sound = skateAudio.enabled;
  const button = document.querySelector('#sound-toggle');
  if (button) {
    button.textContent = skateAudio.enabled ? 'SOUND ON' : 'SOUND OFF';
    button.setAttribute('aria-pressed', String(skateAudio.enabled));
  }
  return skateAudio.enabled;
}
skateAudio.setEffectsVolume(gameShell.effectsVolume);
skateEffects.setLiquidEnabled(playerPreferences.liquid);
applyGraphicsPreset(graphicsPreset);
document.querySelector('#trick-guide-button').onclick = () => gameShell.openTutorial();

function applyGraphicsPreset(name) {
  sceneNeedsRender=true;
  const requestedPreset = normalizedGraphicsPreset(name);
  const accepted = graphicsPipeline.setQuality(requestedPreset, {
    devicePixelRatio: window.devicePixelRatio,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    maxSamples: renderer.capabilities.maxSamples || 2,
  }, { bloomEnabled: gameShell.bloomEnabled, smoothEdges: gameShell.smoothEdges,
    glowTuning:glowPresets[requestedPreset], legacyGlowDefaults, renderScale:playerPreferences.renderScale });
  graphicsPreset=accepted.name;
  skateEffects.setQuality(graphicsPipeline.settings);
  worldLife.setQuality(graphicsPipeline.settings);
  skyLife.setQuality(graphicsPipeline.settings);
  mapDressing.setQuality(graphicsPipeline.settings);
  mapAmbience.setQuality(graphicsPipeline.settings);
  floorReflections.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  floorReflections.setQuality(graphicsPipeline.settings);
  skateEffects.setSize(innerHeight,renderer.getPixelRatio());
  gameShell.graphicsIndex = GRAPHICS_PRESET_ORDER.indexOf(graphicsPreset);
  storeGraphicsPreset(graphicsStorage, graphicsPreset);
  if (currentWorld) {
    currentWorld.surfaceDetail?.setQuality(graphicsPipeline.settings);
    graphicsPipeline.setWorld(currentWorld.park);
    applyLighting();
  }
}

function setGlowValue(key, value) {
  const overrides = normalizeGlowOverrides({ ...glowPresets[graphicsPreset], [key]:value });
  glowPresets = saveGlowPresets({ ...glowPresets, [graphicsPreset]:overrides }, graphicsStorage);
  graphicsPipeline.setGlowTuning(glowPresets[graphicsPreset]);
  sceneNeedsRender = true;
  return graphicsPipeline.getStatus();
}

function resetGlowValues() {
  const next = { ...glowPresets };
  delete next[graphicsPreset];
  glowPresets = saveGlowPresets(next, graphicsStorage);
  if (graphicsPreset === 'high-refresh') {
    legacyGlowDefaults = false;
    useCurrentGlowDefaults(graphicsStorage);
  }
  graphicsPipeline.setGlowTuning({}, {legacyGlowDefaults});
  sceneNeedsRender = true;
  return graphicsPipeline.getStatus();
}

function applyLighting() {
  if (!currentWorld) return;
  const presentation = currentWorld.presentation;
  const sky = presentation.sky && solarSky;
  const settings = !sky && presentation.sky
    ? { ...presentation, ...presentation.fallback } : presentation;
  sun.intensity = dusk ? 0.65 : settings.keyIntensity;
  sun.color.set(dusk ? '#86b5ff' : settings.keyColor);
  ambient.color.set(settings.ambientSky);
  ambient.groundColor.set(settings.ambientGround);
  ambient.intensity = dusk ? 0.4 : settings.ambientIntensity;
  fill.color.set(settings.fillColor || '#bfd8ff');
  fill.intensity = (settings.fillIntensity || 0) * (dusk ? .55 : 1);
  fill.position.set(...(settings.fillPosition || [35, 25, -45]));
  fill.target.position.set(...settings.center);
  fill.target.updateMatrixWorld();
  // Bounce comes from low on the far side of the sun, mirrored across the map centre.
  const [cx, cy, cz] = settings.center, [kx, , kz] = settings.keyPosition;
  bounce.color.set(settings.bounceColor || '#ffa16a');
  bounce.intensity = (settings.bounceIntensity || 0) * (dusk ? .4 : 1);
  bounce.position.set(cx - (kx - cx), cy + 6, cz - (kz - cz));
  bounce.target.position.set(cx, cy, cz);
  bounce.target.updateMatrixWorld();
  renderer.toneMappingExposure = settings.exposure * (graphicsPipeline.settings?.exposureMultiplier || 1);
  graphicsPipeline.setGrade(settings.grade);
  scene.environment = currentWorld.environment || sky?.environment?.texture || environment.texture;
  scene.environmentIntensity = (dusk ? 0.22 : settings.environmentIntensity) *
    ((graphicsPipeline.settings?.environmentIntensity || .84) / .84);
  scene.backgroundBlurriness = graphicsPipeline.settings?.environmentBlur || 0;
  if (sky) {
    scene.background = solarSky.background;
    scene.backgroundIntensity = dusk ? 0.22 : settings.backgroundIntensity;
  } else {
    scene.background = new THREE.Color(dusk ? '#141f32' : settings.background || '#c1d1cf');
    scene.backgroundIntensity = 1;
  }
  const fogColor = dusk ? '#383e50' : settings.fogColor;
  const qualityFog = graphicsPipeline.settings?.fogDensity || .0042;
  const fogRange = settings.fogNear != null
    ? qualityFogDistance(settings.fogNear, settings.fogFar, qualityFog) : null;
  scene.fog = fogRange ? new THREE.Fog(fogColor, fogRange.near, fogRange.far)
    : new THREE.FogExp2(fogColor, settings.fogDensity * qualityFog / .0042);
  sun.target.position.set(...settings.center);
  sun.position.set(...settings.keyPosition);
  const extent = settings.shadowExtent;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.5, far: 240 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.needsUpdate = true;
  floor.visible = Boolean(settings.floor);
  floor.position.y = settings.floor ? -3.18 : -100;
}

// The indoor structure stays complete at skating height. The pre-collected
// roof groups become a cutaway only when a high air or inspection camera would
// otherwise cross the roof; the existing third-person camera rig is untouched.
function updateWorldVisibility() {
  if (!currentWorld?.cameraRoof.length) return;
  const settings = currentWorld.presentation;
  const threshold = settings.roofFadeHeight ?? settings.roofCutawayHeight;
  if (!Number.isFinite(threshold)) return;
  const hidden = currentWorld.roofCutaway
    ? camera.position.y > threshold - 1 : camera.position.y > threshold;
  if (currentWorld.roofCutaway === hidden) return;
  currentWorld.roofCutaway = hidden;
  for (const roof of currentWorld.cameraRoof) roof.visible = !hidden;
}

function setExploreView(name, instant = false) {
  const view = views[name];
  app.dataset.view = name;
  document.querySelectorAll('button[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === name);
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
  document.querySelector('#view-number').textContent = `${view.index} / 03`;
  document.querySelector('#view-caption').textContent = view.caption;
  const position = new THREE.Vector3(...view.position);
  if (innerWidth < 620 && name === 'overview') position.multiplyScalar(1.32);
  if (instant) {
    camera.position.copy(position);
    controls.target.set(...view.target);
    controls.update();
    tween = null;
  } else {
    tween = {
      start: performance.now(), from: camera.position.clone(), to: position,
      targetFrom: controls.target.clone(), targetTo: new THREE.Vector3(...view.target),
    };
  }
}

function setCameraMode(nextMode) {
  if (!followCamera) return;
  followCamera.setMode(nextMode, mode === 'skate' ? skater : null);
  gameShell.cameraIndex = CAMERA_MODES.indexOf(followCamera.mode);
  const button = document.querySelector('#camera-mode');
  button.setAttribute('aria-pressed', String(followCamera.mode === 'follow'));
  button.setAttribute('aria-label', `Camera: ${CAMERA_LABELS[followCamera.mode]}. Cycle camera view`);
  document.querySelector('#camera-label').textContent = CAMERA_LABELS[followCamera.mode].toUpperCase();
  try {
    localStorage.setItem('streetskate.cameraMode.v2', followCamera.mode);
    localStorage.setItem('streetskate.camera', followCamera.mode);
  } catch { /* Storage is optional. */ }
}

function toggleCameraMode() {
  setCameraMode(CAMERA_MODES[(CAMERA_MODES.indexOf(followCamera?.mode) + 1) % CAMERA_MODES.length]);
}

function goToSpot(id) {
  const spot = manifest?.spots?.find(item => item.id === id);
  if (!loaded || !spot || !skater) return;
  skater.spawn.set(...spot.position);
  skater.spawnHeading = spot.heading || 0;
  skater.resetRider(skater.spawn, spot.heading || 0);
  setMode('skate');
  followCamera.snap(skater);
  document.querySelectorAll('[data-spot]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.spot === id));
  });
  renderer.domElement.focus({ preventScroll: true });
}

function setPaused(value) {
  const wasPaused=paused;
  paused = Boolean(value) && mode === 'skate';
  // Synchronous loading work belongs to the pause. Do not charge that old
  // frame interval to the ready countdown or simulation on the first resume.
  if(wasPaused&&!paused)clock.getDelta();
  app.dataset.paused = String(paused);
  input.clear();
  gameShell.syncPause(paused);
  if (paused) {
    if (import.meta.env.DEV && skater?.copingTrace?.size) {
      let capture=document.getElementById('local-coping-capture');
      if(!capture){capture=document.createElement('script');capture.type='application/json';capture.id='local-coping-capture';document.body.append(capture);}
      capture.textContent=JSON.stringify({location:currentWorld?.id,rig:skater.contactRig,
        camera:followCamera?.mode,trace:skater.copingTrace.snapshot()});
    }
    skateAudio.silence();
    input.clear();
    if (skater) {
      skater.charge = 0; skater.jumpBuffer = 0; skater.accumulator = 0;
      skater.pumpReleaseQueued = false; skater.pumpHoldTime = 0;
      skater.pendingStepInput = { olliePressed: false, grindPressed: false, directionTaps: [] };
      skater.tricks.clearPendingInput();
    }
  }
  updateHud();
}

function setMode(nextMode) {
  if (!loaded) return;
  mode = nextMode;
  const skating = mode === 'skate';
  app.dataset.mode = mode;
  controls.enabled = !skating;
  setPaused(false);
  input.clear();
  input.enabled = skating;
  skater.charge = 0;
  skater.jumpBuffer = 0;
  skater.pumpReleaseQueued = false;
  skater.pumpHoldTime = 0;
  skater.accumulator = 0;
  skater.pendingStepInput = { olliePressed: false, grindPressed: false, directionTaps: [] };
  skater.tricks.clearPendingInput();
  skater.visual.visible = true;
  document.querySelector('#mode-toggle').classList.toggle('active', skating);
  document.querySelector('#mode-toggle').setAttribute('aria-pressed', String(skating));
  document.querySelector('#mode-toggle').setAttribute('aria-label', skating ? 'Switch to park explore mode' : 'Start skating');
  document.querySelector('#mode-label').textContent = skating ? 'SKATING' : 'EXPLORE';
  if (skating) {
    tween = null;
    followCamera?.snap(skater);
  } else setExploreView('overview');
}

// HUD flair (enhancement pass): speed gauge fill and a score bump with a
// floating "+points" when a combo banks. Presentation only.
let hudFlairScore = 0, hudFlairSpeed = -1;
// Speed rush (2026-11): wind streaks at the screen edges above ~55 km/h.
const speedRush = document.createElement('div');
speedRush.id = 'speed-rush'; speedRush.setAttribute('aria-hidden', 'true');
document.body.append(speedRush);
let speedRushLevel = 0;

function updateHudFlair(kmh) {
  const rush = Math.max(0, Math.min(1, (kmh - 55) / 45));
  if (Math.abs(rush - speedRushLevel) > .02) { speedRushLevel = rush; speedRush.style.setProperty('--rush', rush.toFixed(2)); }
  const panel = document.querySelector('.skate-hud');
  const ratio = Math.min(1, kmh / 75);
  if (panel && Math.abs(ratio - hudFlairSpeed) > 0.01) {
    hudFlairSpeed = ratio;
    panel.style.setProperty('--speed', ratio.toFixed(3));
    panel.classList.toggle('speed-hot', ratio > 0.82);
  }
  const score = skater.score || 0;
  if (score > hudFlairScore) {
    const total = document.querySelector('.hud-total');
    if (total) {
      total.classList.remove('score-bump');
      void total.offsetWidth;
      total.classList.add('score-bump');
      const gain = document.createElement('span');
      const gainText = `+${(score - hudFlairScore).toLocaleString('en-US')}`;
      gain.className = 'score-gain graffiti-gain';
      gain.innerHTML = graffitiLettering(gainText, 'gold');
      const gainArt = gain.firstElementChild;
      gainArt.classList.remove('graffiti-loading');
      gainArt.classList.add(prepareGraffitiHudGlyphs(gainText, 'gold') === 'ready' ? 'graffiti-ready' : 'graffiti-failed');
      total.appendChild(gain);
      gain.addEventListener('animationend', () => gain.remove(), { once: true });
      setTimeout(() => gain.remove(), 2500);
    }
  }
  hudFlairScore = score;
}

function updateHud() {
  if (!skater) return;
  const kmh = Math.round(Math.abs(skater.speed) * 3.6);
  const speedText=String(kmh).padStart(2,'0');
  setHudGlyphValue(hud['speed-value'],speedText);
  const chargeScale=`scaleX(${skater.charge.toFixed(2)})`;
  if(hud['charge-fill'].style.transform!==chargeScale){
    hud['charge-fill'].style.transform=chargeScale;
    hud['charge-fill'].parentElement.setAttribute('aria-valuenow',String(Math.round(skater.charge*100)));
  }
  let state = skater.grounded ? 'RIDING' : 'AIR';
  if (skater.transitionAir && !skater.transitionAir.transferring) state = 'VERT';
  if (skater.manual) state = skater.manual === 'noseManual' ? 'NOSE MANUAL' : 'MANUAL';
  if (skater.grind) state = 'GRIND';
  if (skater.wallRide) state = 'WALL RIDE';
  if (skater.bailTime > 0) state = 'BAIL';
  if (paused) state = 'PAUSED';
  if(hud['state-value'].textContent!==state)hud['state-value'].textContent=state;
  const scoreText=skater.score.toLocaleString();
  setHudGlyphValue(hud['score-value'],scoreText);
  updateHudFlair(kmh);
  const trickNode = hud['trick-feedback'];
  const trickLabel = skater.feedbackTime > 0 ? skater.feedback : skater.tricks.comboText();
  const comboPhase=skater.bailTime>0?'bail':skater.tricks.combo.length?'active':'notice';
  const comboCaption=comboPhase==='bail'?'TRY AGAIN':'';
  // Keep the previous bitmap text until the replacement glyphs are decoded.
  // A missing image uses the existing readable fallback instead of vanishing.
  if (trickNode.dataset.graffitiText !== trickLabel || trickNode.dataset.comboPhase!==comboPhase) {
    const tone=graffitiToneForTrick(trickLabel);
    const readiness=trickLabel?prepareGraffitiHudGlyphs(trickLabel,graffitiPalette(tone)):'ready';
    // A bail cancels the combo, so do not leave its old points on screen
    // while the red bail lettering is still downloading.
    if(readiness==='loading'&&comboPhase==='bail'&&trickNode.dataset.comboPhase!=='bail'){
      trickNode.replaceChildren();trickNode.dataset.graffitiText='';trickNode.dataset.comboPhase='bail';
    }
    if(readiness!=='loading'){
      trickNode.innerHTML = trickLabel ? `<span class="combo-caption">${comboCaption}</span>`
        +graffitiLettering(trickLabel,graffitiPalette(tone)) : '';
      if(trickLabel){
        const lettering=trickNode.querySelector('.graffiti-lettering');
        lettering.classList.remove('graffiti-loading');
        lettering.classList.add(readiness==='ready'?'graffiti-ready':'graffiti-failed');
      }
      trickNode.dataset.comboPhase=comboPhase;
      trickNode.dataset.graffitiText = trickLabel; // exact same text for safe gradient overlay
      trickNode.dataset.tone = graffitiToneForTrick(trickLabel);
      trickNode.classList.remove('graffiti-pop');
      if (trickLabel) {
        void trickNode.offsetWidth;
        trickNode.classList.add('graffiti-pop');
      }
      scheduleTrickHudFit();
      for (const image of trickNode.querySelectorAll('.graffiti-word img')) {
        if (!image.complete) image.addEventListener('load', scheduleTrickHudFit, { once: true });
      }
    }
  }
  hud['state-value'].classList.toggle('air', !skater.grounded || Boolean(skater.grind));
}

function showError(error) {
  gameShell.loadError = true;
  gameShell.render();
  const loading = document.querySelector('#loading');
  loading.querySelector('p').innerHTML = 'The game could not continue.<span id="load-progress"></span>';
  loading.querySelector('#load-progress').textContent = error?.message || 'Reload the game to try again.';
  loading.querySelector('.loader').style.display = 'none';
  loading.classList.remove('done');
  if (!loading.querySelector('button')) {
    const retry = document.createElement('button');
    retry.textContent = 'Reload game';
    retry.addEventListener('click', () => location.reload());
    loading.append(retry);
  }
  console.error(error);
}

async function ensureWorldEnvironment(world) {
  if (!world.presentation.sky || solarSky) return;
  skyLoading ||= loadSolarSky(renderer).then(sky => { solarSky = sky; return sky; });
  try { await skyLoading; }
  catch (error) {
    skyLoading = null;
    solarSky = { background: createCloudBackdrop(new THREE.Color('#687bb2')) };
    console.warn('HDRI unavailable; keeping fallback lighting.', error);
  }
}

function prepareWorldVisuals(world) {
  world.surfaceDetail?.setQuality(graphicsPipeline.settings);
  const anisotropy = graphicsPipeline.settings?.anisotropy || Math.min(8, renderer.capabilities.getMaxAnisotropy());
  world.park.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.userData.castShadow !== false;
    object.receiveShadow = true;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.map) material.map.anisotropy = anisotropy;
    }
  });
  applyWorldFinishes(world);
  world.park.updateMatrixWorld(true);
  if(['orbit','grand-warehouse','skate-paradise'].includes(world.id))
    world.staticTransformCount=freezeStaticParkTransforms(world.park);
}

function refreshLocationUi() {
  document.querySelector('#poly-count').textContent = `${((manifest.visualTriangles || 0) / 1000).toFixed(1)}k triangles`;
  document.querySelector('.asset-meta > span').textContent = manifest.dimensions || '136 × 92 m · 3 AREAS';
  const center = currentWorld.presentation.center;
  Object.assign(views, manifest.views || {
    overview: { position: [155, 108, 165], target: center, caption: 'Three connected areas', index: '01' },
    bowl: { position: [44, 30, 22], target: center, caption: 'Connected transitions', index: '02' },
    street: { position: [31, 17, 37], target: center, caption: 'Find your next line', index: '03' },
    top: { position: [center[0], 160, center[2] + 0.01], target: center, caption: 'All skating areas', index: '—' },
  });
  const spotNav = document.querySelector('#spot-nav');
  spotNav.replaceChildren();
  for (const spot of manifest.spots || []) {
    const button = document.createElement('button');
    button.textContent = spot.label; button.dataset.spot = spot.id;
    button.title = `Start at ${spot.label}`;
    button.setAttribute('aria-pressed', String(spot.id === 'entrance' || spot.id === 'street'));
    button.onclick = () => goToSpot(spot.id);
    spotNav.append(button);
  }
  spotNav.hidden = !manifest.spots?.length;
  const locationTitle = { legacy: 'LEGACY PARK', rooftop: 'IRON DISTRICT', 'skate-paradise':'MAP 1 / SKATE PARADISE',
    'orbit': 'MAP 2 / ORBIT',
    'grand-warehouse': 'MAP 3 / GRAND WAREHOUSE' }[currentWorld.id] || manifest.name;
  document.title = `Chimp Hawk Underground — ${locationTitle}`;
  document.querySelector('.edition').textContent = locationTitle;
  skateAudio.setLocation?.(currentWorld.id);
  gameShell.setLocation(currentWorld.id, currentWorld.id === 'test-map' ? manifest.name : null);
  transitionDebug?.dispose();
  transitionDebug = null;
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    transitionDebug = new TransitionDebugVisualizer(skater.transitions);
    scene.add(transitionDebug.group);
  }
  if (window.streetSkate) Object.assign(window.streetSkate, {
    currentLocation: currentWorld.id, manifest, park, collision, skater, transitionDebug,
    rampTuning: { factor: manifest.transitionScale, baked: true },
  });
}

function commitWorld(world, runtime) {
  const previousWorld = currentWorld;
  const previousRuntime = previousWorld && {
    surface: skater.surface, boardContact: skater.boardContact, contactRig: skater.contactRig,
    coreController: skater.coreController, railNetwork: skater.railNetwork,
    spawn: skater.spawn, spawnHeading: skater.spawnHeading, playableRegions: skater.playableRegions,
  };
  const previousPosition = skater.position.clone(), previousHeading = skater.heading, previousScore = skater.score;
  try {
    bindParkRuntime(skater, runtime);
    skateEffects.reset(skater);
    currentWorld = world;
    worldLife.setWorld(world);
    skyLife.setWorld(world);
    mapDressing.setWorld(world);
    mapAmbience.setWorld(world);
    floorReflections.setWorld(world);
    ({ park, collision, manifest } = world);
    scene.add(park);
    graphicsPipeline.setWorld(park);
    applyLighting();
    refreshLocationUi();
    input.clear(); tween = null; lastInputState = {};
    followCamera.snap(skater);
    updateHud();
  } catch (error) {
    world.park.removeFromParent();
    if (previousWorld && previousRuntime) {
      currentWorld = previousWorld;
      ({ park, collision, manifest } = previousWorld);
      bindParkRuntime(skater, previousRuntime);
      skater.reset(previousPosition, previousHeading); skater.score = previousScore;
      graphicsPipeline.setWorld(park);
      applyLighting(); refreshLocationUi(); followCamera.snap(skater);
    }
    throw error;
  }
  if (previousWorld && previousWorld !== world) disposeParkWorld(previousWorld, world);
}

async function selectLocation(id, { hero, finish, file, onProgress } = {}) {
  if (!loaded || !skater) throw new Error('Wait for the game to finish loading.');
  if (switchingWorld) throw new Error('A location is already loading.');
  switchingWorld = true;
  const request = ++loadoutRequest;
  setPaused(true);
  let nextWorld, preparedRider;
  const progress = message => {
    onProgress?.(message);
    gameShell.selectError = message;
    if (gameShell.phase === 'select') gameShell.render();
  };
  try {
    if (file || id !== currentWorld.id) {
      nextWorld = file ? await createTestMapWorld(file, progress) : await createParkWorld(id, progress);
      prepareWorldVisuals(nextWorld);
      await ensureWorldEnvironment(nextWorld);
    }
    if (request !== loadoutRequest) { if (nextWorld) disposeParkWorld(nextWorld, currentWorld); return false; }
    const candidate = nextWorld || currentWorld;
    // Build collision BVHs and validate the entry point before replacing any live references.
    const runtime = nextWorld ? prepareParkRuntime(candidate, skater.board.contactRig) : null;
    if (hero?.url) {
      progress('LOADING YOUR CHARACTER…');
      preparedRider=await skater.prepareRiderModel(hero.url, { uploadFilename: hero.id === 'custom' ? hero.uploadFilename : '' });
    }
    progress('PREPARING PARK LIGHTING…');
    // Compile staged assets against the current lighting without attaching them
    // to the resumable run. No live rider/world mutation precedes these awaits.
    if(renderer.compileAsync){
      for(const root of [nextWorld?.park,preparedRider?.root])if(root){
        try{await renderer.compileAsync(root,camera,scene);}catch{/* normal renderer fallback */}
        if(request!==loadoutRequest)break;
      }
    }
    await warmScenePrograms(renderer,scene,camera,{
      isCurrent:()=>request===loadoutRequest,
    });
    if(request!==loadoutRequest){if(nextWorld)disposeParkWorld(nextWorld,currentWorld);return false;}
    // One synchronous commit boundary: Back cannot interleave halfway through.
    if(runtime)commitWorld(candidate,runtime);
    preparedRider?.commit();
    if(finish!=null)skater.board.setFinish(finish);
    followCamera.snap(skater);
    try{renderGameplayWarmup({skater,effects:skateEffects,
      render:()=>graphicsPipeline.render({contactSource:skater,warmup:true})});}catch(error){console.warn('Presentation warmup skipped',error);}
    return { locationId: currentWorld.id, manifest };
  } catch (error) {
    if (nextWorld && nextWorld !== currentWorld) disposeParkWorld(nextWorld, currentWorld);
    throw new Error(`Could not load the selected location. ${error.message || 'Choose another location and retry.'}`);
  } finally {
    preparedRider?.dispose();
    switchingWorld = false;
  }
}

async function loadGame() {
  let initialWorld;
  try {
    initialWorld = await createParkWorld(legacyPark ? 'legacy' : 'skate-paradise', message => {
      document.querySelector('#load-progress').textContent = message;
    });
    prepareWorldVisuals(initialWorld);
    await ensureWorldEnvironment(initialWorld);
    document.querySelector('#load-progress').textContent = 'Loading rider and skateboard';
    skater = await new StreetSkater({ collision: initialWorld.collision, spawn: initialWorld.manifest.spawn,
      rails: initialWorld.manifest.rails, playableRegions: initialWorld.manifest.playableRegions })
      .load({riderUrl:gameShell.heroes[0].url});
    observeRunScoring(skater);
    scene.add(skater.root);
    // Actor-only bloom: visual contains the skateboard and currently selected GLB rider.
    // Keeping the group reference automatically tracks later character hot-swaps.
    graphicsPipeline.setGlowTarget(skater.visual);
    followCamera = new FollowCamera(camera);
    followCamera.setPreferences(playerPreferences);
    currentWorld = initialWorld;
    worldLife.setWorld(initialWorld);
    skyLife.setWorld(initialWorld);
    mapDressing.setWorld(initialWorld);
    mapAmbience.setWorld(initialWorld);
    floorReflections.setWorld(initialWorld);
    ({ park, collision, manifest } = initialWorld);
    scene.add(park, sun.target);
    graphicsPipeline.setWorld(park);
    skater.spawnHeading = Number(manifest.spawnHeading) || 0;
    skater.reset(skater.spawn, skater.spawnHeading);
    applyLighting();
    refreshLocationUi();
    setCameraMode(CAMERA_MODES[gameShell.cameraIndex]);
    renderer.domElement.tabIndex = 0;
    const finishes = document.querySelector('#board-finishes');
    const finishNames = ['Sunset', 'Ocean', 'Aqua', 'Lime', 'Gold', 'Nebula', 'Graphite', 'Pearl'];
    SKATEBOARD_FINISHES.forEach((finish, i) => {
      const button = document.createElement('button'); button.style.background = finish.cssGradient;
      button.title = finishNames[i]; button.setAttribute('aria-label', `Skate ${finishNames[i]}`);
      button.setAttribute('aria-pressed', String(skater.board.finishIndex === i));
      button.onclick = () => { skater.board.setFinish(i); finishes.querySelectorAll('button').forEach((b,j) => b.setAttribute('aria-pressed',String(i===j))); button.blur(); };
      finishes.append(button);
    });
    const soundButton = document.querySelector('#sound-toggle');
    setSkateSound(skateAudio.enabled);
    soundButton.onclick = () => { setSkateSound(!skateAudio.enabled); soundButton.blur(); };
    document.querySelector('#loading').classList.add('done');
    loaded = true;
    setMode('skate');
    setPaused(true);
    gameShell.setReady();
    window.streetSkate = {
      ready: true, scene, renderer, camera, manifest, park, collision, skater, mapDressing, mapAmbience, followCamera, graphicsPipeline,
      currentLocation: currentWorld.id, selectLocation,
      graphicsStatus: () => graphicsPipeline.getStatus(),
      performanceMetrics:()=>({...frameMetrics.value}),
      setMode, setExploreView, setPaused, setCameraMode, goToSpot, controlsVersion: 'thug-controls-v2',
      rampTuning: { factor: manifest.transitionScale, baked: true },
      captureState: () => captureGameplayState(skater),
      captureInput: () => ({ ...lastInputState }),
      setCopingTrace: (enabled, capacity = 720) => { skater.copingTrace = enabled ? new CopingTrace(capacity) : null; },
      captureCopingTrace: () => skater.copingTrace?.snapshot() || [],
      toggleDebugOverlay: () => debugOverlay.toggle(),
      captureAuditTelemetry: () => captureAuditTelemetry({
        skater, followCamera, camera, input: lastInputState,
        paused, focused: document.hasFocus(),
      }),
      transitionDebug,
      captureTransitionDebug: () => transitionDebugSummary(skater.transitions),
    };
    if(import.meta.env.DEV)skater.copingTrace=new CopingTrace();
    if(import.meta.env.DEV)window.streetSkate.audioStatus=()=>({
      recorded:[...skateAudio.recordedFoley],enabled:skateAudio.enabled,
      effectsVolume:skateAudio.effectsVolume,announcerVolume:skateAudio.announcerVolume,
    });
    // Local art-director capture route; Vite removes this block from production.
    if(import.meta.env.DEV){
      const captureMap=new URLSearchParams(location.search).get('art-capture');
      if(['skate-paradise','rooftop','orbit','grand-warehouse'].includes(captureMap)){
        if(captureMap!==currentWorld.id)await selectLocation(captureMap);
        // Reproducible art reviews use the requested tier, independent of a
        // previous session's saved settings. This route is development-only.
        const captureTier=normalizedGraphicsPreset(new URLSearchParams(location.search).get('art-quality')||'cinematic');
        applyGraphicsPreset(captureTier);
        document.title+=` · ${captureTier.toUpperCase()}${graphicsPipeline.getStatus().contactDepthEnabled?' · contact shading':''}`;
        setMode('explore');setExploreView('overview',true);
        const center=currentWorld.presentation.center;
        camera.position.set(center[0]+88,center[1]+55,center[2]+100);
        controls.target.set(...center);camera.lookAt(...center);controls.update();
        if(captureMap==='grand-warehouse'){
          camera.position.set(45,24,42);controls.target.set(-5,2,-15);
          camera.lookAt(controls.target);controls.update();
        }
        gameShell.phase='capture';gameShell.root.hidden=true;gameShell.timer.hidden=true;
        document.body.dataset.screen='capture';gameShell.song.hidden=true;
        artCaptureMap=captureMap;
      }
    }
  } catch (error) {
    loaded = false;
    gameShell.ready = false;
    if (initialWorld) disposeParkWorld(initialWorld);
    transitionDebug?.dispose(); transitionDebug = null;
    currentWorld = null; park = null; collision = null; manifest = null;
    skater?.root.removeFromParent();
    showError(error);
  }
}
controls.addEventListener('start', () => { tween = null; });
document.querySelectorAll('button[data-view]').forEach((button) => button.addEventListener('click', () => {
  if (mode !== 'explore') setMode('explore');
  setExploreView(button.dataset.view);
}));
document.querySelector('#reset').onclick = () => {
  if (mode === 'skate') { skater?.resetRider(); followCamera?.snap(skater); input.clear(); setPaused(false); }
  else setExploreView('overview');
};
document.querySelector('#topview').onclick = () => {
  if (mode !== 'explore') setMode('explore');
  setExploreView('top');
};
document.querySelector('#mode-toggle').onclick = () => setMode(mode === 'skate' ? 'explore' : 'skate');
document.querySelector('#camera-mode').onclick = toggleCameraMode;
document.querySelector('#wireframe').onclick = (event) => {
  const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  park?.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.wireframe = enabled;
  });
};
document.querySelector('#lighting').onclick = (event) => {
  dusk = !dusk;
  applyLighting();
  event.currentTarget.setAttribute('aria-label', dusk ? 'Switch to afternoon' : 'Switch to blue hour');
};

window.addEventListener('resize', () => {
  sceneNeedsRender=true;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  graphicsPipeline.resize(innerWidth, innerHeight);
  skateEffects.setSize(innerHeight,renderer.getPixelRatio());
  scheduleTrickHudFit();
});
function suspendSkating() {
  skateAudio.silence();
  input.clear();
  if (loaded && mode === 'skate') setPaused(true);
}
window.addEventListener('blur', suspendSkating);
window.addEventListener('gamepaddisconnected', suspendSkating);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendSkating();
});
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  suspendSkating();
  showError(new Error('Graphics context lost. Reload to recover.'));
});
setExploreView('overview', true);
loadGame();

renderer.setAnimationLoop(() => {
  const realDelta = clock.getDelta();
  const dt = Math.min(realDelta, 0.1);
  const elapsed = clock.elapsedTime;
  if (document.hidden) return;
  const wasPlaying = gameShell.active;
  gameShell.update(realDelta);
  updateDrillHud();

  // Never silently freeze on the last airborne frame when another overlay/window
  // takes focus. Make the suspension explicit and require a deliberate resume.
  if (loaded && mode === 'skate' && !document.hasFocus() && !paused) setPaused(true);
  if (loaded && mode === 'skate' && document.hasFocus() && !document.hidden) {
    const state = input.read({practice:gameShell.practice && gameShell.active && !paused});
    const inputDisplayActive=practiceInputsEnabled && gameShell.practice && gameShell.active && !paused;
    if (inputDisplayActive) {
      const actions=[];
      if(state.ollieReleased)actions.push('POP');else if(state.ollieHeld)actions.push('CHARGE');
      if(state.flipPressed)actions.push('FLIP');if(state.grabPressed)actions.push('GRAB');
      if(state.grindPressed)actions.push('GRIND');if(state.brake)actions.push('BRAKE');
      if(Math.abs(state.steer)>.32)actions.push(state.steer<0?'LEFT':'RIGHT');
      if(Math.abs(state.drive)>.32)actions.push(state.drive>0?'UP':'DOWN');
      if(actions.length){practiceInputText='INPUT · '+actions.join(' + ');practiceInputTime=1.2;}
      else practiceInputTime=Math.max(0,practiceInputTime-realDelta);
    }
    const showInput=inputDisplayActive && practiceInputTime>0;
    if(inputHud.hidden===showInput)inputHud.hidden=!showInput;
    if(showInput&&inputHud.textContent!==practiceInputText)inputHud.textContent=practiceInputText;
    lastInputState = {
      ...state,
      directionTaps: [...(state.directionTaps || [])],
    };
    if (state.pausePressed && gameShell.active && wasPlaying) setPaused(true);
    if (state.cameraModePressed && gameShell.active) toggleCameraMode();
    if (state.cameraModeIndex != null && gameShell.active) setCameraMode(CAMERA_SHORTCUTS[state.cameraModeIndex] || 'follow');
    if (!paused && gameShell.simulating) {
      if (gameShell.practice && gameShell.inputGrace <= 0) {
        if (state.practiceMark) {
          if (skater.grounded && !skater.bailTime) {
            practiceMarker = { position: skater.position.clone(), heading: skater.heading,
              stance: skater.stance, location: currentWorld.id };
            skater.feedback = 'PRACTICE MARKER SAVED';
          } else skater.feedback = 'LAND BEFORE SAVING A MARKER';
          skater.feedbackTime = 2;
        }
        if (state.practiceReturn) {
          if (practiceMarker?.location === currentWorld.id) {
            skater.resetRider(practiceMarker.position.clone(), practiceMarker.heading);
            skater.stance = practiceMarker.stance;
            skater.airTakeoffStance = practiceMarker.stance;
            skater.syncCanonicalState?.();
            practiceDrills.retry();
            followCamera.snap(skater);
            skater.feedback = 'RETURNED TO MARKER';
          } else skater.feedback = 'SAVE A PRACTICE MARKER FIRST';
          skater.feedbackTime = 2;
        }
      }
      const respawn = skater.respawnSerial;
      sessionEventTime = highlightRecorder.time + realDelta;
      skater.update(dt, gameShell.inputGrace > 0 ? {} : state, elapsed);
      if(gameShell.practice)practiceDrills.observe(skater,dt);
      if (runInProgress) {
        runSummary.update(skater, realDelta);
        highlightRecorder.record(skater, realDelta);
        const eventState={grounded:skater.grounded,pop:skater.presentation?.popTime>0,grind:!!skater.grind,
          catch:skater.presentation?.flipPhase==='CATCH',impact:skater.rider?.ragdoll?.groundImpact,respawn:skater.respawnSerial};
        if(previousPresentationEvent&&eventState.respawn===previousPresentationEvent.respawn){
          const emit=(kind,strength)=>highlightRecorder.markEvent({kind,strength,surface:surfaceTagFor(skater),mapId:currentWorld.id,
            forward:skater.forward.toArray(),
            point:(kind==='bail'?eventState.impact.point:skater.position).toArray(),
            normal:(kind==='bail'?eventState.impact.normal:skater.normal).toArray()});
          if(eventState.impact&&eventState.impact!==previousPresentationEvent.impact)emit('bail',Math.min(1,(eventState.impact.speed||4)/10));
          if(previousPresentationEvent.grind&&(!eventState.grind||skater.bailTime))emit('grindEnd',0);
          if(!skater.bailTime){
            if(eventState.pop&&!previousPresentationEvent.pop)emit('pop',.5);
            if(eventState.grind&&!previousPresentationEvent.grind)emit('grind',.5);
            if(eventState.grounded&&!previousPresentationEvent.grounded&&!eventState.grind)emit('landing',.5);
            if(eventState.catch&&!previousPresentationEvent.catch)emit('catch',.2);
          }
        }
        previousPresentationEvent=eventState;
        for (const moment of pendingReplayMoments) highlightRecorder.markMoment(moment);
        pendingReplayMoments.length = 0;
      }
      if (skater.respawnSerial !== respawn) followCamera.snap(skater);
      skateEffects.update(dt,skater);
      worldLife.update(dt,skater,camera);
      followCamera.update(skater, dt, state, skater._smoothedVisualPosition);
      mapAmbience.update(dt, skater, camera);
      rumble.update(dt, skater, gameShell.active);
      if (state.reset) followCamera.snap(skater);
    }
    updateHud();
  } else {
    if(!inputHud.hidden)inputHud.hidden=true;
    if (tween) {
      const t = Math.min((performance.now() - tween.start) / 1100, 1);
      const smooth = t * t * (3 - 2 * t);
      camera.position.lerpVectors(tween.from, tween.to, smooth);
      controls.target.lerpVectors(tween.targetFrom, tween.targetTo, smooth);
      if (t === 1) tween = null;
    }
    if (mode === 'explore') controls.update();
  }
  // Capture the frozen aftermath during the three-second end-of-session beat.
  if (runFinished && gameShell.phase === 'timeup' && !highlightRecorder.finished)
    highlightRecorder.record(skater, realDelta);
  if (gameShell.phase === 'highlights' && highlightPlayback.active && document.hasFocus())
    highlightPlayback.update(realDelta);
  debugOverlay.update(dt, {
    skater, followCamera, camera, input: lastInputState,
    paused, focused: document.hasFocus(),
  });
  transitionDebug?.update(skater);
  skateAudio.update(skater, loaded && mode === 'skate' && !paused && gameShell.simulating && document.hasFocus());
  const effectsActive = loaded && mode === 'skate' && !paused && gameShell.active && document.hasFocus();
  if (!effectsActive && effectsWereActive) skateEffects.reset(skater);
  skateEffects.root.visible = Boolean(effectsActive||(gameShell.phase==='highlights'&&highlightPlayback.active));
  effectsWereActive = Boolean(effectsActive);
  updateWorldVisibility();
  // Session menus use the supplied sunset artwork and need no hidden park render.
  // Menus show a static park frame. Redraw on settings/screen/viewport changes,
  // rather than running HDR and bloom behind an opaque title/options screen.
  if(gameShell.phase!=='select'&&(gameShell.active||(gameShell.phase==='highlights'&&document.hasFocus())||mode==='explore'||sceneNeedsRender)){
    if(gameShell.simulating)frameMetrics.begin();
    skyLife.update(realDelta, camera);
    // Highlights replay: depth of field on the rider + light motion blur.
    {
      const replaying = gameShell.phase === 'highlights' && highlightPlayback.active;
      let focus = 8;
      if (replaying && skater?.visual) focus = camera.position.distanceTo(skater.visual.getWorldPosition(new THREE.Vector3()));
      graphicsPipeline.setCinematic(replaying, focus);
    }
    updateFloorFinishTime(elapsed);
    reactiveMusic.update(Math.min(realDelta, .1), { music: gameShell.music, audio: skateAudio, skater, active: gameShell.active });
    mapDressing.update(realDelta, skater, camera);
    graphicsPipeline.render({ contactSource: gameShell.phase === 'highlights' ? null : skater });sceneNeedsRender=false;
    if(gameShell.simulating)frameMetrics.end();else frameMetrics.suspend();
    if(import.meta.env.DEV&&artCaptureMap&&!document.getElementById('art-thumbnail')){
      // Bake a compact WebP directly from the rendered canvas, after this frame.
      const thumbnail=document.createElement('canvas');thumbnail.width=768;thumbnail.height=432;
      thumbnail.getContext('2d').drawImage(renderer.domElement,0,0,768,432);
      const image=document.createElement('img');image.id='art-thumbnail';image.hidden=true;
      image.style.display='none';image.alt=artCaptureMap;image.src=thumbnail.toDataURL('image/webp',.88);
      document.body.append(image);
    }
  }
});
