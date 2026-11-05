// Boot + main loop. Physics runs at a fixed 120 Hz; rendering interpolates
// between the last two physics states so motion is smooth at any refresh rate.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { buildTestPark } from './park/TestPark';
import { Skater } from './skater/Skater';
import { SKATER } from './skater/config';
import { Input, type InputFrame } from './input/Input';
import { RiderView } from './render/RiderView';
import { buildParkView } from './render/ParkView';
import { Environment } from './render/Environment';
import { Effects } from './render/Effects';
import { FollowCamera } from './camera/FollowCamera';
import { Hud, controlsTable } from './hud/Hud';
import { SkateAudio } from './audio/SkateAudio';

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
  const park = buildTestPark();
  const physics = await PhysicsWorld.create();
  for (const piece of park.pieces) physics.addGeometry(piece.geometry);
  physics.finalize();

  const environment = new Environment(scene, park.size, quality);
  scene.add(buildParkView(park, renderer));
  const skater = new Skater(physics, park.rails, park.spawn);
  const rider = new RiderView();
  scene.add(rider.root);
  const effects = new Effects();
  scene.add(effects.points);
  const follow = new FollowCamera(camera);
  const hud = new Hud(app);
  const audio = new SkateAudio();
  audio.onTrackChange = title => hud.showToast(`♪ ${title}`);
  const input = new Input(renderer.domElement);
  // Debug handle for the browser console / automated checks.
  (window as unknown as { __chimp: unknown }).__chimp = { skater, physics, park };

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

  let started = false;
  let paused = false;
  const setPaused = (value: boolean) => {
    paused = value;
    pause.classList.toggle('show', paused);
    audio.setPaused(paused);
    input.clear();
  };
  const start = () => {
    if (started) return;
    started = true;
    title.classList.add('hidden');
    void audio.unlock();
    input.clear();
    renderer.domElement.focus();
  };
  title.addEventListener('click', start);
  window.addEventListener('keydown', e => { if (!started && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); start(); } });
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
  const prev = skater.position.clone();
  const renderPos = skater.position.clone();
  let accumulator = 0;
  let pending: InputFrame | null = null;
  loading.remove();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    let frame: InputFrame | null = null;
    if (started) {
      frame = input.read();
      if (frame.pausePressed) setPaused(!paused);
      if (paused) frame = null;
    }

    if (frame) {
      if (frame.cameraModePressed) hud.showToast(`Camera: ${follow.cycle()}`);
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
      if (steps === 8) accumulator = 0;
      for (const event of skater.events.splice(0)) {
        hud.handle(event);
        audio.handle(event);
        effects.handle(event, skater);
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
