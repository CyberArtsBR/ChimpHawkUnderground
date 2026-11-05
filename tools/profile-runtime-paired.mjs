import { mkdir, writeFile } from 'node:fs/promises';
import { launchAuditBrowser, auditUrl } from './quality-browser-runtime.mjs';

// One active game at a time. Supply immutable baseline/candidate URLs for a pair.
const targets = [
  ...(process.env.PERF_BASELINE_URL ? [{ label: 'baseline', url: process.env.PERF_BASELINE_URL }] : []),
  { label: 'candidate', url: process.env.PERF_CANDIDATE_URL || auditUrl },
];
const repeats = Math.max(1, Number(process.env.PERF_REPEATS) || 3);
const duration = Math.max(10000, Number(process.env.PERF_DURATION_MS) || 12000);
const captureCpu = process.env.PERF_CPU_PROFILE === '1';
const shaderProbe = process.env.PERF_SHADER_PROBE === '1';
const output = process.env.AUDIT_PERF_OUTPUT || 'artifacts/evolution-cycle2-performance/runtime';
const maps = (process.env.PERF_MAPS || 'grand-warehouse,orbit,skate-paradise').split(',');
await mkdir(output, { recursive: true });
const report = {
  startedAt: new Date().toISOString(), targets, repeats, duration, captureCpu,
  method: 'One game; fixed 1920x1080 CSS viewport, DPR1, native 144 FPS preset, glow1.5/1.09/.1/.11, AA on, 1024 shadows. Same spawn and timed keyboard route; a controlled input workload, not deterministic simulation replay or display-presentation FPS.',
  gpuMethod: 'Observe each resolved WebGL timer query once, including baseline builds without a sample serial. No extra queries. Serial deduplication fallback if the context method cannot be wrapped.',
  cpuSubmitScope: 'graphicsPipeline.render only: excludes input/physics/animation/HUD/audio. Optional CDP CPU profile covers the route, with sampling overhead applied to both targets.',
  samples: [], errors: [], coldLoads: [],
};
const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
const browser = await launchAuditBrowser();
try {
  for (let repeat = 0; repeat < repeats; repeat++) {
    // Alternate pair order to reduce a systematic warm-machine bias.
    const order = repeat % 2 ? [...targets].reverse() : targets;
    for (const target of order) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      try {
        await context.addInitScript(() => {
          localStorage.setItem('streetskate.graphicsPreset.v2', 'high-refresh');
          localStorage.setItem('streetskate.bloomEnabled', 'on');
          localStorage.setItem('streetskate.smoothEdges', 'on');
          localStorage.setItem('streetskate.cameraMode.v2', 'follow');
          localStorage.setItem('streetskate.camera', 'follow');
          localStorage.setItem('streetskate.glowTuning.v1', '{}');
          localStorage.setItem('streetskate.playerPreferences.v1', JSON.stringify({ performance: true, renderScale: 1 }));
        });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push({ target: target.label, repeat, message: error.message }));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.goto(target.url);
        await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 120000 });
        if (shaderProbe) await page.evaluate(() => {
          const gl = window.streetSkate.renderer.getContext();
          window.runtimeShaderProbe = [];
          for (const method of ['getProgramInfoLog', 'getProgramParameter', 'getShaderInfoLog', 'linkProgram']) {
            const original = gl[method];
            gl[method] = function (...args) {
              const start = performance.now(), result = original.apply(this, args), ms = performance.now() - start;
              if (ms > 4) {
                const program = window.streetSkate.renderer.info.programs.find(entry => entry.program === args[0]);
                window.runtimeShaderProbe.push({ method, ms, at: start, map: window.streetSkate.currentLocation,
                  phase: document.body.dataset.screen, name: program?.name, cacheKey: program?.cacheKey });
              }
              return result;
            };
          }
        });
        report.coldLoads.push({ target: target.label, repeat, ...await page.evaluate(() => ({
          navigation: performance.getEntriesByType('navigation')[0]?.toJSON(), observedReadyAtMs: performance.now(),
          resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name, duration: entry.duration,
            transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize })),
        })) });
        await page.locator('[data-action="practice"]').click();
        await page.locator('[data-action="hero"][data-index="0"]').click();
        await page.locator('[data-action="board"][data-index="6"]').click();
        await page.locator('[data-action="confirmLoadout"]').click();
        await page.locator('body[data-screen="playing"]').waitFor({ timeout: 120000 });
        await page.bringToFront();
        for (const map of maps) {
          await page.evaluate(async id => {
            const game = window.streetSkate;
            await game.selectLocation(id);
            game.setPaused(false);
          }, map);
          await page.waitForTimeout(2000);
          await page.evaluate(() => {
            const game = window.streetSkate;
            game.setPaused(true);
            game.skater.resetRider(game.skater.spawn, game.skater.spawnHeading);
            game.setCameraMode('follow');
            game.setPaused(false);
            game.renderer.domElement.focus({ preventScroll: true });
          });
          if (captureCpu) {
            await cdp.send('Profiler.enable');
            await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
            await cdp.send('Profiler.start');
          }
          const data = await page.evaluate(async sampleDuration => {
            const game = window.streetSkate, renderer = game.renderer, gl = renderer.getContext();
            const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            const debug = gl.getExtension('WEBGL_debug_renderer_info');
            const quality = game.graphicsStatus();
            if (quality.name !== 'high-refresh' || quality.renderScale !== 1 || quality.pixelRatio !== 1 ||
              quality.renderWidth !== 1920 || quality.renderHeight !== 1080 || quality.msaaSamples < 2 ||
              !quality.bloomEnabled || quality.shadowResolution !== 1024 ||
              quality.glowTuning.emissive !== 1.5 || quality.glowTuning.bloom !== 1.09 ||
              quality.glowTuning.glow !== .1 || quality.glowTuning.radius !== .11)
              throw new Error('Profile quality contract mismatch: ' + JSON.stringify(quality));
            const graph = root => {
              const counts = { nodes: 0, meshes: 0, skinnedMeshes: 0, bones: 0, lights: 0 };
              root?.traverse(node => { counts.nodes++; counts.meshes += Number(!!node.isMesh);
                counts.skinnedMeshes += Number(!!node.isSkinnedMesh); counts.bones += Number(!!node.isBone); counts.lights += Number(!!node.isLight); });
              return counts;
            };
            const metadata = { map: game.currentLocation, viewport: [innerWidth, innerHeight],
              canvas: [renderer.domElement.width, renderer.domElement.height], dpr: devicePixelRatio,
              quality, focused: document.hasFocus(), runtimeGraph: { scene: graph(game.scene), park: graph(game.park), actor: graph(game.skater.visual) },
              manifestStatistics: game.manifest.statistics, positionStart: game.skater.position.toArray(),
              spawn: game.skater.spawn.toArray(), spawnHeading: game.skater.spawnHeading,
              memoryStart: { ...renderer.info.memory },
              hardware: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
            if (!metadata.focused) throw new Error('Profile page must have focus');
            const frames = [], gpu = [], cpu = [], calls = [], triangles = [], longFrames = [], seenQueries = new WeakSet();
            const originalResult = gl.getQueryParameter;
            let gpuMode = 'sample-serial', lastGpuSerial = game.performanceMetrics().gpuSampleSerial || 0;
            if (extension) {
              const observeResult = function (query, parameter) {
                const value = originalResult.call(this, query, parameter);
                if (parameter === gl.QUERY_RESULT && !seenQueries.has(query) && Number.isFinite(value)) {
                  seenQueries.add(query); gpu.push(value / 1e6);
                }
                return value;
              };
              try { gl.getQueryParameter = observeResult; if (gl.getQueryParameter === observeResult) gpuMode = 'query-result-observer'; } catch {}
            }
            const held = new Set();
            const key = (code, down) => {
              if (down === held.has(code)) return;
              if (down) held.add(code); else held.delete(code);
              window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code.replace('Key', ''), bubbles: true }));
            };
            // Exact same wall-clock event times in every run; final pose records route drift.
            const events = [[0, 'KeyW', true], [1500, 'KeyD', true], [3500, 'KeyD', false], [3500, 'KeyA', true],
              [5500, 'KeyA', false], [6500, 'Space', true], [6850, 'Space', false],
              [7100, 'ArrowLeft', true], [7200, 'ArrowLeft', false], [8500, 'KeyD', true], [10500, 'KeyD', false]];
            let eventIndex = 0, previous = null, first = null, lostFocusFrames = 0, serialUnavailable = false;
            try {
              await new Promise(resolve => {
                const tick = now => {
                  first ??= now;
                  const elapsed = now - first;
                  while (eventIndex < events.length && events[eventIndex][0] <= elapsed) {
                    const [, code, down] = events[eventIndex++]; key(code, down);
                  }
                  if (previous !== null) frames.push(now - previous);
                  previous = now;
                  if (!document.hasFocus() || document.hidden) lostFocusFrames++;
                  const value = game.performanceMetrics();
                  if (previous !== null && frames.at(-1) > 50) longFrames.push({ elapsed, ms: frames.at(-1),
                    renderCpuMs: value.cpuSubmitMs, calls: value.calls, triangles: value.triangles });
                  if (Number.isFinite(value.cpuSubmitMs)) cpu.push(value.cpuSubmitMs);
                  if (Number.isFinite(value.calls)) calls.push(value.calls);
                  if (Number.isFinite(value.triangles)) triangles.push(value.triangles);
                  if (gpuMode === 'sample-serial') {
                    if (!Number.isFinite(value.gpuSampleSerial)) serialUnavailable = true;
                    else if (value.gpuSampleSerial > lastGpuSerial && Number.isFinite(value.gpuMs)) {
                      lastGpuSerial = value.gpuSampleSerial; gpu.push(value.gpuMs);
                    }
                  }
                  if (elapsed >= sampleDuration) resolve(); else requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
              });
            } finally {
              for (const code of [...held]) key(code, false);
              if (gl.getQueryParameter !== originalResult) try { gl.getQueryParameter = originalResult; } catch {}
            }
            const stats = values => {
              if (!values.length) return { count: 0, mean: null, median: null, p95: null, p99: null };
              const sorted = [...values].sort((a, b) => a - b);
              const percentile = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
              return { count: values.length, mean: values.reduce((sum, value) => sum + value, 0) / values.length,
                median: percentile(.5), p95: percentile(.95), p99: percentile(.99) };
            };
            return { ...metadata, frameIntervalsMs: stats(frames), callbackFps: 1000 / stats(frames).mean,
              over144Budget: frames.filter(value => value > 1000 / 144).length,
              renderCpuSubmitMs: stats(cpu), gpuMs: stats(gpu), gpuMode,
              gpuTimingSupported: !!extension, gpuSerialUnavailable: serialUnavailable,
              drawCalls: stats(calls), triangles: stats(triangles), lostFocusFrames,
              longFrames, shaderProbe: window.runtimeShaderProbe?.slice(),
              memoryEnd: { ...renderer.info.memory }, positionEnd: game.skater.position.toArray(),
              respawnSerial: game.skater.respawnSerial, phaseEnd: document.body.dataset.screen };
          }, duration);
          let cpuProfileFile = null;
          if (captureCpu) {
            const { profile } = await cdp.send('Profiler.stop');
            cpuProfileFile = `${target.label}-${repeat + 1}-${map}.cpuprofile`;
            await writeFile(`${output}/${cpuProfileFile}`, JSON.stringify(profile));
            const byId = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
            const totals = new Map();
            for (let index = 0; index < profile.samples.length; index++) {
              const id = profile.samples[index];
              totals.set(id, (totals.get(id) || 0) + profile.timeDeltas[index] / 1000);
            }
            data.cpuProfileTopSelfMs = [...totals].map(([id, selfMs]) => ({ ...byId.get(id), selfMs }))
              .sort((a, b) => b.selfMs - a.selfMs).slice(0, 30);
          }
          report.samples.push({ target: target.label, repeat: repeat + 1, cpuProfileFile, ...data });
          await save();
          console.log(JSON.stringify({ target: target.label, repeat: repeat + 1, map,
            fps: data.callbackFps, p95Ms: data.frameIntervalsMs.p95, gpuSamples: data.gpuMs.count,
            gpuP95Ms: data.gpuMs.p95, renderCpuMeanMs: data.renderCpuSubmitMs.mean }));
          if (data.lostFocusFrames || data.phaseEnd !== 'playing') throw new Error('Route lost focus or left gameplay');
        }
      } finally { await context.close(); }
    }
  }
  report.result = report.errors.length ? 'FAIL' : 'PASS';
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.medians = targets.flatMap(target => maps.map(map => {
    const runs = report.samples.filter(sample => sample.target === target.label && sample.map === map);
    return { target: target.label, map, runs: runs.length, callbackFps: median(runs.map(run => run.callbackFps)),
      p95Ms: median(runs.map(run => run.frameIntervalsMs.p95)), renderCpuMeanMs: median(runs.map(run => run.renderCpuSubmitMs.mean)),
      gpuP95Ms: runs.every(run => run.gpuMs.count) ? median(runs.map(run => run.gpuMs.p95)) : null };
  }));
  if (report.errors.length) process.exitCode = 1;
} catch (error) {
  report.result = 'FAIL'; report.failure = String(error.stack || error); process.exitCode = 1;
  console.error(error);
} finally { report.finishedAt = new Date().toISOString(); await save(); await browser.close(); }
