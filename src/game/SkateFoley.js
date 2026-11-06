import { gameAssetUrl } from './AssetPaths.js';

const contexts = new WeakMap();
export function foleyCacheStatus(context) {
  const cache=contexts.get(context);
  const states=[...(cache?.entries.values()||[])];
  return { total:states.length, ready:states.filter(e=>e.state==='ready').length,
    failed:states.filter(e=>e.state==='failed').length, loading:states.filter(e=>e.state==='loading').length };
}
export function disposeFoleyCache(context) {
  const cache=contexts.get(context);if(!cache)return;
  cache.disposed=true;cache.abort.abort();cache.entries.clear();contexts.delete(context);
}
async function decodedClip(context,path,fetcher,assetUrl) {
  let cache=contexts.get(context);
  if(!cache){cache={entries:new Map(),abort:new AbortController(),disposed:false};contexts.set(context,cache);}
  const url=assetUrl(path),existing=cache.entries.get(url);
  if(existing&&existing.state!=='failed')return existing.promise;
  const entry={state:'loading'};cache.entries.set(url,entry);
  entry.promise=(async()=>{
    try {
      const response=await fetcher(url,{signal:cache.abort.signal});
      if(!response.ok)throw new Error(`Audio unavailable: ${path}`);
      const buffer=await context.decodeAudioData(await response.arrayBuffer());
      if(cache.disposed)throw new Error('Audio context disposed');
      if(!buffer?.duration||!Number.isFinite(buffer.duration))throw new Error(`Invalid audio: ${path}`);
      entry.state='ready';return buffer;
    } catch(error){entry.state='failed';throw error;}
  })();
  return entry.promise;
}

// Original field recordings; license and provenance are in public/audio/foley/CREDITS.md.
export const SKATE_FOLEY_FILES = Object.freeze({
  pop:'/audio/foley/pop.wav', landing:'/audio/foley/land.wav',
  bail:'/audio/foley/bail.ogg', roll:'/audio/foley/roll.wav',
});

// Alternate files are authored recordings, not copies presented as new takes.
export const SKATE_FOLEY_BANKS = Object.freeze({
  pop: ['/audio/foley/pop.wav','/audio/foley/pop-skate-1.wav','/audio/foley/pop-skate-2.wav'],
  landing: ['/audio/foley/land.wav','/audio/foley/land-skate-1.wav','/audio/foley/land-skate-2.wav'],
  catch: [1,2].map(n => `/audio/foley/catch-skate-${n}.wav`),
  landingConcrete: [1,2].map(n => `/audio/foley/landing-concrete-${n}.ogg`),
  landingMetal: [1,2].map(n => `/audio/foley/landing-metal-${n}.ogg`),
  cloth: [1,2].map(n => `/audio/foley/cloth-${n}.ogg`),
  scrapeMetal: ['/audio/foley/scrape-skate-metal.mp3'],
  scrapeConcrete: ['/audio/foley/scrape-skate-concrete.mp3'],
  ambienceWarehouse: ['/audio/foley/ambience-warehouse.wav'],
  ambienceParadise: ['/audio/foley/ambience-paradise.wav'],
  bail: ['/audio/foley/bail.ogg'],
  ...Object.fromEntries(['confirm','back','ready','go','roundOver','tenSeconds','finalFive'].map(kind => [`cue:${kind}`, [`/audio/foley/cue-${kind}.ogg`]])),
  voicePain: [1,2,3].map(n => `/audio/foley/voice-pain-${n}.mp3`),
  voiceEffort: ['/audio/foley/voice-effort-1.mp3', ...[2,3,4].map(n => `/audio/foley/voice-effort-${n}.wav`)],
  crowdSubdued: ['/audio/foley/crowd-claps.ogg'],
  crowdMedium: ['/audio/foley/crowd-claps.ogg'],
  crowdExceptional: ['/audio/foley/crowd-claps.ogg'],
  // 2026-11 audio pass: synthesized in-house (see CREDITS.md).
  landingWood: [1,2].map(n => `/audio/foley/landing-wood-${n}.wav`),
  landingRubber: ['/audio/foley/landing-rubber-1.wav'],
  rollWood: ['/audio/foley/roll-wood.wav'],
  grindClack: [1,2].map(n => `/audio/foley/grind-clack-${n}.wav`),
  ambienceOrbit: ['/audio/foley/ambience-orbit.wav'],
  cheerSmall: ['/audio/foley/crowd-cheer-small.wav'],
  cheerMedium: ['/audio/foley/crowd-cheer-medium.wav'],
  cheerBig: ['/audio/foley/crowd-cheer-big.wav'],
  crowdGroan: ['/audio/foley/crowd-groan.wav'],
});

// Sustained passes only: exclude the field take's mounting contacts and pauses.
// Windows were measured in 50ms blocks; source recordings remain unmodified.
export const SKATE_SCRAPE_WINDOWS = Object.freeze({
  scrapeMetal: Object.freeze({ start: 2.35, end: 3.80, crossfade: .08 }),
  scrapeConcrete: Object.freeze({ start: 19.70, end: 21.75, crossfade: .08 }),
});

// Map ambience loops load only when that map is entered (2026-11), so a first
// session does not download all three loops up front.
export const LAZY_FOLEY_BANKS = Object.freeze(['ambienceWarehouse', 'ambienceParadise', 'ambienceOrbit']);

export function loadSkateFoleyBanks(context, onClip, { fetcher=globalThis.fetch, assetUrl=gameAssetUrl, include=null }={}) {
  if (!context?.decodeAudioData || typeof fetcher!=='function') return Promise.resolve([]);
  // Decode each URL once even when shared by two intensity banks.
  const wanted = Object.entries(SKATE_FOLEY_BANKS).filter(([kind]) => include ? include.includes(kind) : !LAZY_FOLEY_BANKS.includes(kind));
  const urls = [...new Set(wanted.flatMap(([, paths]) => paths))];
  return Promise.allSettled(urls.map(async path => {
    const buffer = await decodedClip(context,path,fetcher,assetUrl);
    for (const [kind, paths] of Object.entries(SKATE_FOLEY_BANKS)) if (paths.includes(path)) onClip(kind, buffer);
    return path;
  }));
}

/** Decode each clip independently; one missing asset never suppresses another. */
export function loadSkateFoley(context, onClip, { fetcher=globalThis.fetch, assetUrl=gameAssetUrl }={}) {
  if (!context?.decodeAudioData || typeof fetcher!=='function') return Promise.resolve([]);
  return Promise.allSettled(Object.entries(SKATE_FOLEY_FILES).map(async ([kind,path])=>{
    const decoded=await decodedClip(context,path,fetcher,assetUrl);
    onClip(kind,decoded);
    return kind;
  }));
}

/** Restrain uneven contact voices without altering pitch or lifting quiet noise. */
export function recordedVoiceGain(buffer) {
  if (!buffer?.getChannelData) return 1;
  let peak = 0, energy = 0, count = 0;
  for (let channel = 0; channel < (buffer.numberOfChannels || 1); channel++) {
    for (const value of buffer.getChannelData(channel)) {
      if (!Number.isFinite(value)) continue;
      peak = Math.max(peak, Math.abs(value)); energy += value * value; count++;
    }
  }
  const rms = Math.sqrt(energy / Math.max(1, count));
  if (rms < .01) return 1;
  // The quiet take receives at most +2.6dB; most correction attenuates the loud take.
  return Math.min(1.35, .07 / rms, .45 / Math.max(.001, peak));
}

/** Mono overlap crossfade removes the hard seam from a field-recording loop. */
export function seamlessFoleyLoop(context, input, { start = 0, end, crossfade = .04 } = {}) {
  if (!input?.getChannelData || !context?.createBuffer) return input;
  const inputLength = input.length || input.getChannelData(0).length;
  const first = Math.max(0, Math.min(inputLength-1, Math.floor((Number(start)||0)*input.sampleRate)));
  const last = Math.max(first+1, Math.min(inputLength, Number.isFinite(end) ? Math.floor(end*input.sampleRate) : inputLength));
  const length = last-first;
  const overlap = Math.min(Math.floor(input.sampleRate*Math.max(0,Math.min(.25,crossfade))), Math.floor(length/8));
  const output = context.createBuffer(1,length-overlap,input.sampleRate), data = output.getChannelData(0);
  const channels = input.numberOfChannels || 1;
  for (let channel=0;channel<channels;channel++) {
    const source=input.getChannelData(channel);
    for(let i=0;i<data.length;i++) {
      const t=i/overlap;
      data[i]+=(i<overlap?source[first+length-overlap+i]*(1-t)+source[first+i]*t:source[first+i])/channels;
    }
  }
  return output;
}
