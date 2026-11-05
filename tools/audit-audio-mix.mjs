import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

// Text-only OfflineAudioContext audit. No game, WebGL, external assets or devices.
const root = resolve('.'), out = 'artifacts/finish-mix-v3/audio', baselineRef = process.env.AUDIO_BASELINE_REF || '66fcd65';
await mkdir(out, { recursive: true });
const baseline = {};
for (const name of ['SkateAudio', 'MusicPlayer']) {
  baseline[name] = execFileSync('git', ['show', `${baselineRef}:src/game/${name}.js`], { encoding: 'utf8' });
  await writeFile(`${out}/before-${name}.js`, baseline[name].replaceAll("from './", "from '/src/game/"));
}
const mime = { '.js': 'text/javascript', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Offline soundtrack mix audit</title>'); return; }
    if (!/^\/(src|audio|media|artifacts)\//.test(path)) throw Error('Unserved path');
    const file = resolve(root, '.' + (/^\/(audio|media)\//.test(path) ? '/public' + path : path));
    if (!file.startsWith(root + sep)) throw Error('Outside workspace');
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchAuditBrowser();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const results = await page.evaluate(async () => {
    const { SKATE_FOLEY_BANKS } = await import('/src/game/SkateFoley.js');
    const { createSkateImpact } = await import('/src/game/SkateSoundSynthesis.js');
    const { TRACKS } = await import('/src/game/MusicPlayer.js');
    const decode = new OfflineAudioContext(2, 24000, 24000), buffers = new Map(), tracks = [], renders = [];
    for (const path of [...new Set(['voicePain', 'voiceEffort', 'crowdExceptional', 'bail', 'cloth'].flatMap(kind => SKATE_FOLEY_BANKS[kind]))]) {
      buffers.set(path, await decode.decodeAudioData(await (await fetch(path)).arrayBuffer()));
    }
    const sampleRate = 24000, seconds = 6, originals = { now: Date.now, set: window.setInterval, clear: window.clearInterval, random: Math.random };
    for (const [trackIndex, [title, file]] of TRACKS.entries()) {
      const musicBuffer = await decode.decodeAudioData(await (await fetch('/media/' + file)).arrayBuffer());
      // Choose an actual dense six-second passage; do not normalize or boost it.
      let peak = 0, bestEnergy = -1, offset = 0;
      for (let start = 0; start < musicBuffer.length; start += sampleRate * seconds) {
        let energy = 0;
        for (let channel = 0; channel < musicBuffer.numberOfChannels; channel++) {
          const data = musicBuffer.getChannelData(channel);
          for (let i = start; i < Math.min(start + sampleRate * seconds, data.length); i++) { peak = Math.max(peak, Math.abs(data[i])); energy += data[i] ** 2; }
        }
        if (start + sampleRate * seconds <= musicBuffer.length && energy > bestEnergy) { bestEnergy = energy; offset = start / sampleRate; }
      }
      tracks.push({ title, path: '/media/' + file, offset, sourcePeak: peak, duration: musicBuffer.duration });
      for (const version of ['before', 'after']) {
        const { SkateAudio } = await import(version === 'before' ? '/artifacts/finish-mix-v3/audio/before-SkateAudio.js' : '/src/game/SkateAudio.js');
        const { MusicPlayer } = await import(version === 'before' ? '/artifacts/finish-mix-v3/audio/before-MusicPlayer.js' : '/src/game/MusicPlayer.js');
        for (const scene of ['pain', 'crowd', 'crowd-pause']) {
          if (scene === 'crowd-pause' && trackIndex > 0) continue;
          const render = new OfflineAudioContext(2, sampleRate * seconds, sampleRate), audio = new SkateAudio(), timers = new Map(), envelope = [], requests = [];
          let now = 0, nextTimer = 1, seed = 931;
          Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
          Date.now = () => now;
          window.setInterval = (fn, interval) => { const id = nextTimer++; timers.set(id, { fn, interval, next: now + interval }); return id; };
          window.clearInterval = id => timers.delete(id);
          audio.context = new Proxy(render, { get(target, key) { if (key === 'state') return 'running'; if (key === 'currentTime') return now / 1000; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
          // Same independent buses/compressor as SkateAudio.unlock. Music routes
          // straight to output, as the live HTMLAudioElement does in the game.
          const compressor = render.createDynamicsCompressor();
          compressor.threshold.value = -12; compressor.knee.value = 10; compressor.ratio.value = 4; compressor.attack.value = .004; compressor.release.value = .12; compressor.connect(render.destination);
          for (const [name, level] of [['master', .85 * .35], ['characterVoice', .85 * .45], ['crowd', .85 * .3]]) {
            audio[name] = render.createGain(); audio[name].gain.value = level; audio[name].connect(compressor);
          }
          for (const [kind, paths] of Object.entries(SKATE_FOLEY_BANKS)) if (paths.every(path => buffers.has(path))) audio.banks[kind] = paths.map(path => buffers.get(path));
          audio.impacts = { loss: createSkateImpact(render, 'loss'), bail: audio.banks.bail[0] };
          const param = () => ({ setTargetAtTime() {} }), layer = () => ({ gain: { gain: param() }, filter: { frequency: param() } });
          audio.roll = layer(); audio.grind = layer(); audio.wind = layer();
          const musicGain = render.createGain(), musicSource = render.createBufferSource();
          musicGain.gain.value = .5; musicGain.connect(render.destination); musicSource.buffer = musicBuffer; musicSource.connect(musicGain); musicSource.start(0, offset, seconds);
          const music = Object.create(MusicPlayer.prototype);
          Object.assign(music, { disposed: false, duckAmount: 1, duckTimer: null, musicVolume: .5,
            audio: { set volume(value) { musicGain.gain.setValueAtTime(value, now / 1000); } } });
          audio.onMusicDuck = request => { requests.push({ at: now, ...request }); return music.duck(request.durationMs, request.amount, request.releaseMs); };
          const player = { velocity: { length: () => 10, dot: () => -8 }, normal: {}, presentation: {}, respawnSerial: 1, grounded: false, bailTime: 0, rider: { ragdoll: { groundImpact: null } } };
          audio.update(player, true);
          const painTakes = audio.banks.voicePain.slice();
          for (now = 0; now < seconds * 1000; now++) {
            if (scene === 'pain' && [500, 1500, 2500].includes(now)) {
              audio.banks.voicePain = [painTakes[(now - 500) / 1000]]; audio.reactions.lastVoice = -Infinity;
              player.bailTime = 1; player.rider.ragdoll.groundImpact = { speed: 8 };
              const duck = audio.update(player, true);
              if (version === 'before' && duck) { requests.push({ at: now, durationMs: 650, amount: .7, releaseMs: 120 }); music.duck(650, .7); }
            }
            if (scene.startsWith('crowd') && now === 500) {
              const duck = audio.onComboSettled({ id: 'accepted', points: 4000, location: 'grand-warehouse' });
              if (version === 'before' && duck) { requests.push({ at: now, durationMs: 900, amount: .65, releaseMs: 120 }); music.duck(900, .65); }
            }
            if (scene === 'crowd-pause' && now === 1500) audio.silence();
            for (const timer of [...timers.values()]) if (now >= timer.next) { timer.next += timer.interval; timer.fn(); }
            if (now % 20 === 0) envelope.push({ time: now / 1000, amount: music.duckAmount });
          }
          Date.now = originals.now; window.setInterval = originals.set; window.clearInterval = originals.clear; Math.random = originals.random;
          document.removeEventListener('visibilitychange', audio._visibility);
          const output = await render.startRendering(), channels = Array.from({ length: 2 }, (_, i) => Array.from(output.getChannelData(i)));
          let outputPeak = 0, energy = 0, clippedSamples = 0, nonFiniteSamples = 0;
          for (const data of channels) for (const value of data) { if (!Number.isFinite(value)) nonFiniteSamples++; outputPeak = Math.max(outputPeak, Math.abs(value)); energy += value ** 2; if (Math.abs(value) >= 1) clippedSamples++; }
          renders.push({ version, scene, title, file, offset, requests, envelope, sampleRate, peak: outputPeak, rms: Math.sqrt(energy / output.length / 2), clippedSamples, nonFiniteSamples, activeTimersAtEnd: timers.size,
            ...(trackIndex === 0 ? { channels } : {}) });
        }
      }
    }
    return { tracks, renders, reactionSources: [...buffers].map(([path, buffer]) => ({ path, duration: buffer.duration })) };
  });
  const audition = (version, scene) => results.renders.find(render => render.title === 'Chimpion Drip' && render.version === version && render.scene === scene);
  const levelAt = (render, time) => render.envelope.find(frame => Math.abs(frame.time - time) < .001).amount;
  assert.ok(levelAt(audition('after', 'pain'), .8) > .9 && levelAt(audition('before', 'pain'), .8) < .71, 'short contact returns music after its take');
  assert.equal(levelAt(audition('after', 'crowd'), 3.5), .65, 'applause body retains its hold');
  assert.equal(levelAt(audition('before', 'crowd'), 3.5), 1, 'baseline comparison actually exercises early music return');
  assert.equal(levelAt(audition('after', 'crowd-pause'), 2), 1, 'stopping applause releases its hold promptly');
  const digest = value => createHash('sha256').update(value).digest('hex');
  for (const source of [...results.tracks, ...results.reactionSources]) source.sha256 = digest(await readFile('public' + source.path));
  for (const render of results.renders) {
    assert.equal(render.nonFiniteSamples, 0, 'finite mixed output'); assert.equal(render.clippedSamples, 0, 'unclipped default-level mixed output'); assert.equal(render.activeTimersAtEnd, 0, 'duck timers finish');
    if (!render.channels) continue;
    const channels = render.channels, wav = Buffer.alloc(44 + channels[0].length * 4);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(render.sampleRate, 24); wav.writeUInt32LE(render.sampleRate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 0; i < channels[0].length; i++) for (let channel = 0; channel < 2; channel++) wav.writeInt16LE(Math.round(channels[channel][i] * 32767), 44 + i * 4 + channel * 2);
    render.audition = `${render.version}-${render.scene}.wav`; await writeFile(`${out}/${render.audition}`, wav); delete render.channels;
  }
  results.baselineRef = baselineRef;
  results.sourceHashes = {};
  for (const name of ['SkateAudio', 'MusicPlayer']) results.sourceHashes[name] = { before: digest(baseline[name]), after: digest(await readFile(`src/game/${name}.js`)) };
  results.limitation = 'Offline signal/scheduling evidence, six-second dense soundtrack passages at shipping defaults, stereo 24kHz. Not hardware listening or proof against every possible simultaneous event/user volume. Board-loss/contact foley is included in pain scenes; continuous rolling, ambience and room reflections are omitted.';
  await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2));
  await writeFile(`${out}/index.html`, `<!doctype html><meta charset="utf-8"><title>Soundtrack reaction mix A/B</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;background:#142027;color:#eaf5f4;font:17px system-ui}section{border-top:1px solid #557077;padding:20px 0}label,audio{display:block;margin:12px 0}audio{width:100%}a{color:#91ded2}</style><h1>Soundtrack reaction mix A/B</h1><p>Same authored Chimpion Drip passage, source recordings, default levels and event times. Before: fixed 650ms contact / 900ms applause music holds. After: holds follow the selected take and its release. This is offline signal evidence; no physical listening signoff.</p><p>All seven soundtrack files also have dense-passage clipping checks in <a href="report.json">report.json</a>. Pain takes start at 0.5, 1.5 and 2.5s; applause at 0.5s; pause stops applause at 1.5s.</p>${['pain', 'crowd', 'crowd-pause'].map(scene => `<section><h2>${scene}</h2>${['before', 'after'].map(version => `<label>${version}<audio controls preload="none" src="${version}-${scene}.wav"></audio></label>`).join('')}</section>`).join('')}`);
  console.log(JSON.stringify({ renders: results.renders.length, maximumPeak: Math.max(...results.renders.map(render => render.peak)), clippedSamples: results.renders.reduce((sum, render) => sum + render.clippedSamples, 0), out }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
