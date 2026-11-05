export const AUDIO_DEFAULTS = Object.freeze({ music: 0.5, effects: 0.35, announcer: 0.45, crowd: 0.3, voice: 0.45 });

export function clampVolume(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

export function readAudioVolume(channel) {
  const fallback = AUDIO_DEFAULTS[channel];
  try {
    const saved = localStorage.getItem(`streetskate.${channel}Volume`);
    return saved === null ? fallback : clampVolume(saved, fallback);
  } catch { return fallback; }
}

export function saveAudioVolume(channel, value) {
  const volume = clampVolume(value);
  try { localStorage.setItem(`streetskate.${channel}Volume`, String(volume)); } catch {}
  return volume;
}

export function readBackgroundAudio() {
  try { return localStorage.getItem('streetskate.backgroundAudio') === 'on'; } catch { return false; }
}

export function saveBackgroundAudio(value) {
  const enabled = Boolean(value);
  try { localStorage.setItem('streetskate.backgroundAudio', enabled ? 'on' : 'off'); } catch {}
  return enabled;
}
