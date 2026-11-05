import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = 'artifacts/audio-motion';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const errors = [], report = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__audioContexts = [];
    const NativeAudio = window.Audio;
    window.Audio = function(...args) { const audio = new NativeAudio(...args); window.__musicAudio = audio; return audio; };
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args);
        window.__audioContexts.push(this);
        this.observedGains = []; this.observedHits = [];
        const gain = this.createGain.bind(this), source = this.createBufferSource.bind(this);
        this.createGain = () => { const node = gain(); this.observedGains.push(node); return node; };
        this.createBufferSource = () => {
          const node = source(), start = node.start.bind(node);
          node.start = (...startArgs) => { if (!node.loop) this.observedHits.push({ duration: node.buffer?.duration, time: this.currentTime }); start(...startArgs); };
          return node;
        };
        this.observedAnalyser = this.createAnalyser(); this.observedAnalyser.fftSize = 2048;
        const compressor = this.createDynamicsCompressor.bind(this);
        this.createDynamicsCompressor = () => { const node = compressor(); node.connect(this.observedAnalyser); return node; };
      }
    };
  });
  await page.goto(process.env.STREETSKATE_URL || 'http://127.0.0.1:5185', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 60000 });
  await page.locator('[data-action="options"]').click();
  report.defaults = await page.evaluate(() => ({ music: window.__musicAudio.volume,
    effectsGain: window.__audioContexts[0].observedGains[0].gain.value,
    labels: [...document.querySelectorAll('.audio-volume-control')].map(row => row.textContent.trim().replace(/\s+/g,' ')) }));
  assert.equal(report.defaults.music, 0.5);
  await page.locator('[data-action="musicUp"]').click();
  await page.locator('[data-action="effectsDown"]').click();
  report.separateVolumes = await page.evaluate(() => ({ music: window.__musicAudio.volume,
    musicSaved: localStorage.getItem('streetskate.musicVolume'), effectsSaved: localStorage.getItem('streetskate.effectsVolume') }));
  assert.deepEqual(report.separateVolumes, { music: 0.6, musicSaved: '0.6', effectsSaved: '0.25' });
  await page.locator('[data-action="musicDown"]').click();
  await page.screenshot({ path: `${output}/audio-options-desktop.png` });
  await page.setViewportSize({ width: 1280, height: 600 });
  report.shortDesktop = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
    buttons: [...document.querySelectorAll('.audio-volume-control button')].map(button => {
      const r = button.getBoundingClientRect(); return { width: r.width, height: r.height, right: r.right }; }) }));
  assert.ok(report.shortDesktop.buttons.every(button => button.width >= 44 && button.height >= 44 && button.right <= 1280));
  await page.screenshot({ path: `${output}/audio-options-short-desktop.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await page.waitForFunction(() => window.streetSkate?.ready, null, { timeout: 60000 });
  await page.locator('[data-action="options"]').click();
  assert.ok((await page.locator('.audio-volume-control').nth(1).innerText()).includes('25%'));
  assert.equal(await page.evaluate(() => window.__musicAudio.volume), 0.5);
  await page.locator('[data-action="effectsUp"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => localStorage.getItem('streetskate.effectsVolume')), '0.35');
  await page.locator('[data-action="practice"]').click();
  await page.locator('.loadout-character').first().click();
  await page.locator('.loadout-deck').nth(2).click();
  await page.locator('.loadout-location[data-location="orbit"]').click();
  await page.locator('[data-action="confirmLoadout"]').click();
  await page.locator('body[data-screen="playing"]').waitFor({ timeout: 60000 });
  await page.locator('#viewport canvas').click({ position: { x: 300, y: 300 } });
  // Put the player on the authored flat spawn, then use the actual input loop.
  await page.evaluate(() => { const g = window.streetSkate; g.skater.reset(); g.setMode('skate'); g.setPaused(false); });
  await page.waitForTimeout(650);
  report.rolling = await page.evaluate(() => {
    const s = window.streetSkate.skater, c = window.__audioContexts[0];
    const samples = new Float32Array(2048); c.observedAnalyser.getFloatTimeDomainData(samples);
    return { speed: s.velocity.length(), grounded: s.grounded, pushWeight: s.presentation.pushWeight,
      audioState: c.state, rms: Math.sqrt(samples.reduce((sum,n) => sum+n*n,0)/samples.length) };
  });
  assert.equal(report.rolling.audioState, 'running');
  assert.ok(report.rolling.rms > 0.003, `inaudible rolling: ${report.rolling.rms}`);
  assert.ok(report.rolling.pushWeight > 0.3, 'shipping movement must show a remada');
  await page.screenshot({ path: `${output}/rolling.png` });
  await page.keyboard.down('Space'); await page.waitForTimeout(220); await page.keyboard.up('Space');
  await page.waitForFunction(() => window.__audioContexts[0].observedHits.some(hit => Math.abs(hit.duration-.11) < .001), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__audioContexts[0].observedHits.some(hit => Math.abs(hit.duration-.24) < .001), null, { timeout: 10000 });
  report.gameplayHits = await page.evaluate(() => window.__audioContexts[0].observedHits);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  report.paused = await page.evaluate(() => {
    const c = window.__audioContexts[0], samples = new Float32Array(2048); c.observedAnalyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum,n) => sum+n*n,0)/samples.length);
  });
  assert.ok(report.paused < 0.002, `pause should silence skate effects: ${report.paused}`);
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile(`${output}/browser-checks.json`, JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
