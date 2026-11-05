// Boot + main loop. Physics runs at a fixed 120 Hz; rendering interpolates
// between the last two physics states so motion is smooth at any refresh rate.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { Skater } from './skater/Skater';
import { SKATER } from './skater/config';
import { Input, type InputFrame } from './input/Input';
import { RiderView } from './render/RiderView';
import { Environment } from './render/Environment';
import { Effects } from './render/Effects';
import { FollowCamera } from './camera/FollowCamera';
import { Hud, controlsTable } from './hud/Hud';
import { SkateAudio } from './audio/SkateAudio';
import { MAPS, loadMap, readMapId, saveMapId, type MapId } from './maps';
import { RIDERS, loadCatalogRider, loadUploadedRider, readRiderId, saveRiderId } from './riders';
import { loadGlb } from './render/loadGltf';
import type { RigRider } from './render/RigRider';
import { RunStats, ScoreRecords, Session, type SessionEvent } from './game/Session';

type Quality = 'high' | 'low';

const EDGE_KEYS = ['olliePressed', 'ollieReleased', 'flipPressed', 'grabPressed', 'grindPressed', 'switchStancePressed',
  'reset', 'practiceMark', 'practiceReturn'] as const;

/** Keep held state, drop one-shot edges (they belong to the first physics step only). */
function heldOnly(frame: InputFrame): InputFrame {
  const copy = { ...frame, directionTaps: [] };
  for (const key of EDGE_KEYS) copy[key] = false;
  return copy;
}

/** Carry edges from a frame that ran no physics step into the next frame. */
function mergeEdges(pending: InputFrame | null, frame: InputFrame): InputFrame {
  if (!pending) return frame;
  const merged = { ...frame, directionTaps: [...pending.directionTaps, ...frame.directionTaps] };
  for (const key of EDGE_KEYS) merged[key] = pending[key] || frame[key];
  return merged;
}

function readQuality(): Quality {
  try { return localStorage.getItem('chimphawk.quality') === 'low' ? 'low' : 'high'; } catch { return 'high'; }
}

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading')!;
  const quality = readQuality();

  const renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  app.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  await document.fonts?.load('150px Bangers').catch(() => undefined);
  const mapId = readMapId();
  const map = await loadMap(mapId, renderer, f => { loading.textContent = `Loading ${MAPS.find(m => m.id === mapId)!.name}… ${Math.round(f * 100)}%`; });
  const physics = await PhysicsWorld.create();
  for (const geometry of map.collision) physics.addGeometry(geometry);
  physics.finalize();

  const environment = new Environment(scene, renderer, { ...map.environment, quality });
  scene.add(map.visual);
  const skater = new Skater(physics, map.rails, map.spawn, map.regions);
  const prev = new THREE.Vector3();
  const rider = new RiderView();
  scene.add(rider.root);
  // Real models stream in after the map; the placeholder covers the gap.
  void loadGlb(import.meta.env.BASE_URL + 'assets/riders/skateboard.glb').then(g => rider.setBoardModel(g.scene)).catch(e => console.warn(e));
  let riderId = readRiderId();
  const applyRider = async (load: () => Promise<RigRider>) => {
    try { rider.setRider(await load()); return null; } catch (e) { console.warn(e); return e instanceof Error ? e.message : String(e); }
  };
  const initial = RIDERS.find(r => r.id === riderId) ?? RIDERS[0];
  void applyRider(() => loadCatalogRider(initial));
  const effects = new Effects();
  scene.add(effects.points);
  const follow = new FollowCamera(camera, physics);
  const hud = new Hud(app);
  const audio = new SkateAudio();
  audio.onTrackChange = title => hud.showToast(`♪ ${title}`);
  const input = new Input(renderer.domElement);
  // Debug handle for the browser console / automated checks.
  (window as unknown as { __chimp: unknown }).__chimp = { skater, physics, map, rider, camera, follow };

  let composer: EffectComposer | null = null;
  if (quality === 'high') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.92));
    composer.addPass(new OutputPass());
  }

  // ── Menus ──────────────────────────────────────────────────────────────
  const title = document.getElementById('title')!;
  const pause = document.getElementById('pause')!;
  document.getElementById('controls-table')!.innerHTML = controlsTable(input.bindings);
  const sfxSlider = document.getElementById('sfx-volume') as HTMLInputElement;
  const musicSlider = document.getElementById('music-volume') as HTMLInputElement;
  const qualityButton = document.getElementById('quality') as HTMLButtonElement;
  sfxSlider.value = String(audio.sfxVolume);
  musicSlider.value = String(audio.musicVolume);
  qualityButton.textContent = `Graphics: ${quality === 'high' ? 'High' : 'Low'} (reloads)`;
  sfxSlider.oninput = () => audio.setSfxVolume(Number(sfxSlider.value));
  musicSlider.oninput = () => audio.setMusicVolume(Number(musicSlider.value));
  qualityButton.onclick = () => { try { localStorage.setItem('chimphawk.quality', quality === 'high' ? 'low' : 'high'); } catch { /* ignore */ } location.reload(); };
  document.getElementById('next-track')!.onclick = () => audio.nextTrack();

  // ── Rider + map select ─────────────────────────────────────────────────
  const select = document.getElementById('select')!;
  const riderList = document.getElementById('rider-list')!;
  const mapList = document.getElementById('map-list')!;
  const selectStatus = document.getElementById('select-status')!;
  const upload = document.getElementById('rider-upload') as HTMLInputElement;
  let chosenMap: MapId = mapId;
  const renderSelect = () => {
    riderList.innerHTML = RIDERS.map(r => `<button class="pick ${r.id === riderId ? 'chosen' : ''}" data-rider="${r.id}" style="--accent:${r.accent}"><b>${r.name}</b><small>${r.subtitle}</small></button>`).join('')
      + `<button class="pick upload ${riderId === 'custom' ? 'chosen' : ''}" data-rider="upload"><b>⬆ Upload rider</b><small>Your own rigged .glb</small></button>`;
    mapList.innerHTML = MAPS.map(m => `<button class="pick ${m.id === chosenMap ? 'chosen' : ''}" data-map="${m.id}"><b>${m.name}</b><small>${m.subtitle}</small></button>`).join('');
  };
  riderList.addEventListener('click', async e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rider]');
    if (!button) return;
    if (button.dataset.rider === 'upload') { upload.click(); return; }
    const entry = RIDERS.find(r => r.id === button.dataset.rider)!;
    riderId = entry.id; saveRiderId(riderId); renderSelect();
    selectStatus.textContent = `Loading ${entry.name}…`;
    const error = await applyRider(() => loadCatalogRider(entry));
    selectStatus.textContent = error ?? `${entry.name} is ready.`;
  });
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    upload.value = '';
    if (!file) return;
    selectStatus.textContent = `Checking ${file.name}…`;
    const error = await applyRider(() => loadUploadedRider(file));
    if (error) { selectStatus.textContent = `Couldn't use that rider: ${error}`; return; }
    riderId = 'custom'; renderSelect();
    selectStatus.textContent = `${file.name} is rigged and ready. (Uploaded riders last until you reload.)`;
  });
  mapList.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-map]');
    if (!button) return;
    chosenMap = button.dataset.map as MapId; renderSelect();
    selectStatus.textContent = chosenMap === mapId ? '' : 'The map loads when you press Skate.';
  });
  // Mode: timed run or free skate (remembered).
  const modeList = document.getElementById('mode-list')!;
  let mode: 'run' | 'free' = (() => { try { return localStorage.getItem('chimphawk.mode') === 'free' ? 'free' : 'run'; } catch { return 'run'; } })();
  const renderModes = () => modeList.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.classList.toggle('chosen', b.dataset.mode === mode));
  modeList.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (!button) return;
    mode = button.dataset.mode as 'run' | 'free';
    try { localStorage.setItem('chimphawk.mode', mode); } catch { /* ignore */ }
    renderModes();
  });
  renderModes();
  renderSelect();

  // ── Session Run ────────────────────────────────────────────────────────
  const session = new Session();
  const records = new ScoreRecords();
  const stats = new RunStats();
  (window as unknown as { __chimp: Record<string, unknown> }).__chimp.session = session;
  const results = document.getElementById('results')!;
  const beginRun = (practice: boolean) => {
    results.classList.remove('show');
    skater.resetRun();
    prev.copy(skater.position);
    stats.reset();
    session.begin({ practice });
    hud.setTimer(session.phase, session.remaining, session.overtimeRemaining, practice);
    if (!practice) { hud.announce('READY', MAPS.find(m => m.id === mapId)!.name, 'bank'); audio.cue('ready'); }
    else hud.announce('FREE SKATE', 'No clock · M / N markers', 'bank');
    input.clear();
  };
  const showResults = () => {
    const isBest = records.record(mapId, skater.score, stats.bestCombo.points);
    const best = records.best(mapId);
    const reasons: Record<string, string> = { clock: 'TIME!', bail: 'BAILED AT THE BUZZER', landed: 'LANDED IT!', 'grace-expired': 'TIME!', 'attempt-ended': 'TIME!' };
    document.getElementById('results-title')!.textContent = reasons[session.finishReason ?? 'clock'];
    document.getElementById('results-score')!.textContent = skater.score.toLocaleString();
    const bestEl = document.getElementById('results-best')!;
    bestEl.textContent = isBest && skater.score > 0 ? 'NEW BEST ON THIS SPOT!' : best ? `Best here: ${best.score.toLocaleString()}` : '';
    bestEl.classList.toggle('new', isBest && skater.score > 0);
    document.getElementById('results-stats')!.innerHTML =
      `<div class="combo"><span>Best combo</span><b>${stats.bestCombo.points.toLocaleString()}</b><br><small>${stats.bestCombo.label || '—'}</small></div>`
      + `<div><span>Combos landed</span><b>${stats.banked}</b></div><div><span>Tricks</span><b>${stats.tricks}</b></div>`
      + `<div><span>Longest grind</span><b>${stats.longestGrind.toFixed(1)} s</b></div><div><span>Biggest air</span><b>${stats.biggestAir.toFixed(1)} s</b></div>`
      + `<div><span>Bails</span><b>${stats.bails}</b></div>`;
    results.classList.add('show');
    audio.cue('over');
  };
  const onSessionEvent = (e: SessionEvent) => {
    if (e === 'go') { hud.announce('GO!', '', 'bank'); audio.cue('go'); }
    if (e === 'ten') { hud.showToast('10 seconds left'); audio.cue('ten'); }
    if (e === 'five') audio.cue('five');
    if (e === 'overtime') hud.announce('LAND IT!', 'Finish your combo', 'bank');
    if (e === 'finish') showResults();
  };
  document.getElementById('run-again')!.onclick = () => beginRun(false);
  document.getElementById('results-free')!.onclick = () => { mode = 'free'; renderModes(); beginRun(true); };
  document.getElementById('results-change')!.onclick = () => { results.classList.remove('show'); openSelect(); };

  let started = false;
  let paused = false;
  const setPaused = (value: boolean) => {
    paused = value;
    pause.classList.toggle('show', paused);
    audio.setPaused(paused);
    input.clear();
  };
  const openSelect = () => { title.classList.add('hidden'); select.classList.add('show'); };
  document.getElementById('change-rider')!.onclick = () => { pause.classList.remove('show'); openSelect(); };
  document.getElementById('skate')!.onclick = () => {
    if (chosenMap !== mapId) { saveMapId(chosenMap); location.search = `?map=${chosenMap}`; return; }
    select.classList.remove('show');
    if (!started) start(); else setPaused(false);
    beginRun(mode === 'free');
  };
  const start = () => {
    if (started) return;
    started = true;
    title.classList.add('hidden');
    select.classList.remove('show');
    void audio.unlock();
    input.clear();
    renderer.domElement.focus();
  };
  title.addEventListener('click', () => { void audio.unlock(); openSelect(); });
  window.addEventListener('keydown', e => {
    if (started || !(e.code === 'Enter' || e.code === 'Space')) return;
    e.preventDefault();
    void audio.unlock();
    if (select.classList.contains('show')) document.getElementById('skate')!.click(); else openSelect();
  });
  document.getElementById('resume')!.onclick = () => setPaused(false);
  document.addEventListener('visibilitychange', () => { if (document.hidden && started && !paused) setPaused(true); });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Loop ───────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  prev.copy(skater.position);
  const renderPos = skater.position.clone();
  let accumulator = 0;
  let pending: InputFrame | null = null;
  let lastAirTime = 0, lastGrindTime = 0;
  loading.remove();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    let frame: InputFrame | null = null;
    if (started) {
      frame = input.read();
      if (frame.pausePressed) setPaused(!paused);
      if (paused) frame = null;
    }

    if (frame && session.phase === 'finished') frame = null;
    if (frame) {
      if (frame.cameraModePressed) hud.showToast(`Camera: ${follow.cycle()}`);
      const attempt = {
        comboActive: skater.combo.active,
        bailed: skater.state === 'bail',
        eligibleAttempt: skater.state !== 'bail' && (skater.combo.active || skater.state === 'air' || skater.state === 'grind' || skater.state === 'manual'),
      };
      for (const e of session.update(dt, attempt)) onSessionEvent(e);
      hud.setTimer(session.phase, session.remaining, session.overtimeRemaining, session.practice);
    }
    if (frame && !session.allowSimulation) frame = null;
    if (frame) {
      const merged = mergeEdges(pending, frame);
      accumulator += dt;
      let steps = 0;
      while (accumulator >= SKATER.step && steps < 8) {
        prev.copy(skater.position);
        skater.step(steps === 0 ? merged : heldOnly(merged));
        accumulator -= SKATER.step;
        steps++;
      }
      pending = steps === 0 ? merged : null;
      if (skater.air) lastAirTime = skater.air.time;
      if (skater.grind) lastGrindTime = skater.grind.time;
      if (steps === 8) accumulator = 0;
      for (const event of skater.events.splice(0)) {
        hud.handle(event);
        audio.handle(event);
        effects.handle(event, skater);
        if (event.type === 'land') { rider.land(event.impact); follow.kick(event.impact); stats.biggestAir = Math.max(stats.biggestAir, lastAirTime); }
        if (event.type === 'trick') stats.tricks++;
        if (event.type === 'bail') stats.bails++;
        if (event.type === 'grindEnd') stats.longestGrind = Math.max(stats.longestGrind, lastGrindTime);
        if (event.type === 'bank') {
          stats.banked++;
          if (event.points > stats.bestCombo.points) stats.bestCombo = { points: event.points, label: event.label };
          session.acceptSettlement();
        }
      }
      if (frame.practiceMark) hud.showToast('Marker saved');
    }

    const alpha = accumulator / SKATER.step;
    if (prev.distanceToSquared(skater.position) > 9) prev.copy(skater.position);
    renderPos.lerpVectors(prev, skater.position, alpha);
    rider.update(skater, renderPos, dt);
    follow.update(skater, renderPos, frame, dt);
    environment.follow(renderPos);
    effects.update(skater, dt);
    audio.update(skater);
    hud.update(skater, dt);

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  });
}

boot().catch(error => {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Could not start the game. Please reload.';
});
