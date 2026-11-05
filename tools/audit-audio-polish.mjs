import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { launchAuditBrowser } from './quality-browser-runtime.mjs';

// A text-only local page; this audit never starts the game or creates WebGL.
const root = resolve('.'), out = 'artifacts/evolution-cycle2/audio';
await mkdir(out, { recursive: true });
const baselineRef = process.env.AUDIO_BASELINE_REF || '77fbf6d';
const baseline = execFileSync('git', ['show', `${baselineRef}:src/game/SkateAudio.js`], { encoding: 'utf8' });
await writeFile(`${out}/before-SkateAudio.js`, baseline.replaceAll("from './", "from '/src/game/"));
const mime = { '.js': 'text/javascript', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Offline audio audit</title>'); return; }
    if (!/^\/(src|audio|artifacts)\//.test(path)) throw Error('Unserved path');
    const file = resolve(root, '.' + (path.startsWith('/audio/') ? '/public' + path : path));
    if (!file.startsWith(root + sep)) throw Error('Outside workspace');
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchAuditBrowser();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const results = await page.evaluate(async ({ measureOnly }) => {
    const { SKATE_FOLEY_BANKS, SKATE_SCRAPE_WINDOWS, seamlessFoleyLoop } = await import('/src/game/SkateFoley.js');
    const context = new OfflineAudioContext(1, 24000, 24000), buffers = new Map(), clips = [];
    for (const path of [...new Set(Object.values(SKATE_FOLEY_BANKS).flat())]) {
      const buffer = await context.decodeAudioData(await (await fetch(path)).arrayBuffer());
      buffers.set(path, buffer);
      let peak = 0, energy = 0, first = -1, last = -1;
      const rms50ms = [], window = Math.round(buffer.sampleRate * .05);
      for (let i = 0; i < buffer.length; i++) {
        let value = 0;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) value += buffer.getChannelData(ch)[i] / buffer.numberOfChannels;
        peak = Math.max(peak, Math.abs(value)); energy += value * value;
        if (Math.abs(value) > .01) { if (first < 0) first = i; last = i; }
      }
      for (let start = 0; start < buffer.length; start += window) {
        let sum = 0, count = Math.min(window, buffer.length - start);
        for (let i = start; i < start + count; i++) {
          let v = 0; for (let ch = 0; ch < buffer.numberOfChannels; ch++) v += buffer.getChannelData(ch)[i] / buffer.numberOfChannels;
          sum += v * v;
        }
        rms50ms.push(Math.sqrt(sum / count));
      }
      clips.push({ path, duration: buffer.duration, peak, rms: Math.sqrt(energy / buffer.length),
        firstOverMinus40dB: first / buffer.sampleRate, lastOverMinus40dB: last / buffer.sampleRate, rms50ms });
    }
    const loopWindows = [];
    for (const [kind, window] of Object.entries(SKATE_SCRAPE_WINDOWS)) {
      const input = buffers.get(SKATE_FOLEY_BANKS[kind][0]), loop = seamlessFoleyLoop(context, input, window), data = loop.getChannelData(0);
      const blocks = [];
      for (let start = 0; start < data.length; start += 1200) {
        const values = data.subarray(start, start + 1200);
        blocks.push(Math.sqrt(values.reduce((energy, value) => energy + value * value, 0) / values.length));
      }
      loopWindows.push({ kind, ...window, loopDuration: loop.duration,
        peak: data.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
        rms: Math.sqrt(data.reduce((energy, value) => energy + value * value, 0) / data.length),
        minimum50msRms: Math.min(...blocks.slice(0, -1)), seamJump: Math.abs(data[0] - data.at(-1)) });
    }
    const renders = [];
    for (const version of measureOnly ? [] : ['before', 'after']) {
      const { SkateAudio } = await import(version === 'before' ? '/artifacts/evolution-cycle2/audio/before-SkateAudio.js' : '/src/game/SkateAudio.js');
      for (const scene of ['voice-levels', 'bail-contact', 'crowd-bands', 'scrapeMetal', 'scrapeConcrete']) {
        const sampleRate = 24000, seconds = scene === 'crowd-bands' ? 11 : scene.startsWith('scrape') ? 6 : 4, segments = [];
        const render = new OfflineAudioContext(1, sampleRate * seconds, sampleRate), audio = new SkateAudio(); let time = 0;
        audio.context = new Proxy(render, { get(target, key) {
          if (key === 'state') return 'running'; if (key === 'currentTime') return time;
          const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
        } });
        for (const [name, level] of [['master', .85 * .35], ['characterVoice', .85 * .45], ['crowd', .85 * .3]]) {
          audio[name] = render.createGain(); audio[name].gain.value = level; audio[name].connect(render.destination);
        }
        for (const [kind, paths] of Object.entries(SKATE_FOLEY_BANKS)) audio.banks[kind] = paths.map(path => buffers.get(path));
        const param = () => ({ setTargetAtTime() {} }), layer = () => ({ gain: { gain: param() }, filter: { frequency: param() } });
        audio.roll = layer(); audio.grind = layer(); audio.wind = layer();
        if (scene === 'voice-levels') {
          const takes = audio.banks.voicePain.slice();
          for (let i = 0; i < takes.length; i++) { time = .3 + i; audio.banks.voicePain = [takes[i]]; audio.playBank('voicePain', audio.characterVoice, .36); segments.push({ name: `pain-${i + 1}`, start: time, end: time + .6 }); }
        } else if (scene === 'bail-contact') {
          const player = { velocity: { length: () => 10, dot: () => -8 }, normal: {}, presentation: {}, respawnSerial: 1, grounded: false, bailTime: 0, rider: { ragdoll: { groundImpact: null } } };
          audio.impact = () => {}; audio.banks.cloth = []; audio.banks.voicePain = [audio.banks.voicePain[0]];
          time = .1; audio.update(player, true); time = .3; player.bailTime = 1; audio.update(player, true);
          time = .37; player.rider.ragdoll.groundImpact = { speed: 8 }; audio.update(player, true);
          segments.push({ name: 'effort-to-pain', start: .3, end: .9 });
        } else if (scene.startsWith('scrape')) {
          const source = render.createBufferSource();
          source.buffer = seamlessFoleyLoop(render, buffers.get(SKATE_FOLEY_BANKS[scene][0]), version === 'before' ? {} : SKATE_SCRAPE_WINDOWS[scene]);
          source.loop = true; source.connect(audio.master); source.start(.1); source.stop(5.8);
          segments.push({ name: 'field-take-versus-sustained-loop', start: .1, end: 5.8 });
        } else {
          for (const [i, points] of [400, 1500, 4000].entries()) { time = .2 + i * 3; audio.reactions.lastCrowd = -Infinity; audio.onComboSettled({ id: i, points }); segments.push({ name: String(points), start: time, end: time + (i === 2 ? 4.5 : 2.5) }); }
        }
        const output = await render.startRendering(), samples = Array.from(output.getChannelData(0));
        for (const segment of segments) {
          const data = samples.slice(Math.floor(segment.start * sampleRate), Math.floor(segment.end * sampleRate));
          segment.peak = data.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
          segment.rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
        }
        renders.push({ version, scene, sampleRate, segments, samples });
      }
    }
    return { clips, loopWindows, renders };
  }, { measureOnly: process.env.AUDIO_MEASURE_ONLY === '1' });
  const { renders, ...report } = results;
  const digest = value => createHash('sha256').update(value).digest('hex');
  report.baselineRef = baselineRef;
  report.baselineSourceSHA256 = digest(baseline);
  report.currentSourceSHA256 = digest(await readFile('src/game/SkateAudio.js'));
  for (const clip of report.clips) clip.sha256 = digest(await readFile('public' + clip.path));
  report.renders = [];
  for (const render of renders) {
    const { samples, ...meta } = render, wav = Buffer.alloc(44 + samples.length * 2);
    assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < 1), 'finite, unclipped render');
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(render.sampleRate, 24); wav.writeUInt32LE(render.sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
    let peak = 0, energy = 0;
    samples.forEach((value, i) => { peak = Math.max(peak, Math.abs(value)); energy += value * value; wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2); });
    const file = `${render.version}-${render.scene}.wav`;
    await writeFile(`${out}/${file}`, wav); report.renders.push({ ...meta, file, peak, rms: Math.sqrt(energy / samples.length) });
  }
  report.limitation = 'Offline signal and scheduling evidence only. No physical listening or subjective sound quality signoff.';
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  if (renders.length) {
    const scenes = [...new Set(renders.map(render => render.scene))];
    const content = scenes.map(scene => `<section><h2>${scene}</h2>${['before', 'after'].map(version => `<label>${version}<audio controls preload="none" src="${version}-${scene}.wav"></audio></label>`).join('')}</section>`).join('');
    await writeFile(`${out}/index.html`, `<!doctype html><meta charset="utf-8"><title>Local audio polish comparison</title><style>body{max-width:880px;margin:40px auto;padding:0 20px;background:#142027;color:#eaf5f4;font:17px system-ui}section{border-top:1px solid #557077;padding:20px 0}label{display:block;margin:12px 0}audio{display:block;width:100%;margin-top:6px}a{color:#91ded2}</style><h1>Local audio polish comparison</h1><p>Runtime playback of existing recordings, at default voice/crowd bus levels. No music, game rendering or new audio sources. A/B files share the same source takes and timing. Scrape comparisons isolate the old full-take loop and new sustained window, at matching gain and normal speed.</p><p>Voice takes play one per second. Bail contact follows the loss grunt by 70ms. Crowd bands play 400, 1500 and 4000-point lines. <a href="report.json">Waveform measurements</a>. Human audition is still required.</p>${content}`);
  }
  console.log(JSON.stringify({ clips: report.clips.length, renders: report.renders }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
