import { gameAssetUrl } from './AssetPaths.js';
import { readAudioVolume, saveAudioVolume, readBackgroundAudio, saveBackgroundAudio } from './AudioSettings.js';
export const TRACKS = [
  ['Chimpion Drip','chimpion-drip.mp3'], ['Chimpion Slide','chimpion-slide.mp3'],
  ['West Park','west-park.mp3'], ['Old School flip','old-school-flip.mp3'],
  ['Aerial Flute','aerial-flute.mp3'], ['Skate Vibe','skate-vibe.mp3'], ['808 Bas','808-bas.mp3'],
];

export class MusicPlayer {
  constructor(onChange = () => {}) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.baseVolume = 1;
    this.musicVolume = readAudioVolume('music');
    this.masterVolume = this.musicVolume;
    this.audio.volume = this.musicVolume;
    this.backgroundAudio = readBackgroundAudio();
    this.duckAmount = 1;
    this.duckTimer = null;
    this.queue = [];
    this.current = -1;
    this.onChange = onChange;
    this.unlocked = false;
    this.failed = new Set();
    this.playPending = null;
    this.generation = 0;
    this.disposed = false;
    this._ended = () => this.next();
    this._error = () => {
      if (this.disposed || this.current < 0) return;
      this.failed.add(this.current);
      if (this.failed.size < TRACKS.length) this.next();
      else this.onChange(this.title, 'Soundtrack unavailable — reload to retry');
    };
    this._visibility = () => {
      if (this.isBackgroundMuted()) {
        this.generation++; this.playPending = null; this.audio.pause();
      } else this.unlock();
    };
    this.unlock = this.unlock.bind(this);
    this.audio.addEventListener('ended', this._ended);
    this.audio.addEventListener('error', this._error);
    window.addEventListener('pointerdown', this.unlock, { passive: true });
    window.addEventListener('keydown', this.unlock, { passive: true });
    document.addEventListener('visibilitychange', this._visibility);
    this.next();
  }

  get title() { return TRACKS[this.current]?.[0] || ''; }
  isBackgroundMuted() { return !this.backgroundAudio && Boolean(document.hidden); }

  shuffle() {
    this.queue = TRACKS.map((_, i) => i).filter(i => !this.failed.has(i));
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    // Pop() is the next play. Never repeat the last song at a cycle boundary.
    const last = this.queue.length - 1;
    if (last > 0 && this.queue[last] === this.current) {
      [this.queue[last], this.queue[0]] = [this.queue[0], this.queue[last]];
    }
  }

  next() {
    if (this.disposed) return;
    this.queue = this.queue.filter(i => !this.failed.has(i));
    if (!this.queue.length) this.shuffle();
    if (!this.queue.length) return;
    this.current = this.queue.pop();
    this.generation++;
    // Invalidate old play promises before replacing the source; a rapid skip
    // must not allow a stale rejection to block the replacement track.
    this.playPending = null;
    this.audio.pause();
    this.audio.src = gameAssetUrl('/media/' + TRACKS[this.current][1]);
    this.onChange(this.title, '');
    void this.play();
  }

  async play() {
    if (this.disposed || this.isBackgroundMuted() || this.playPending || this.failed.size === TRACKS.length) return;
    const generation = this.generation;
    let pending;
    try {
      pending = Promise.resolve(this.audio.play());
      this.playPending = pending;
      await pending;
      if (generation !== this.generation || this.disposed) return;
      this.unlocked = true;
      this.onChange(this.title, '');
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      if (error?.name === 'NotAllowedError') {
        // Retry on an ordinary input; avoid a second explicit Enter/click instruction.
        this.onChange(this.title, '');
      } else if (error?.name !== 'AbortError') {
        this.onChange(this.title, 'Unable to play track · skip to retry');
      }
    } finally {
      if (this.playPending === pending) this.playPending = null;
    }
  }

  unlock() {
    if (this.disposed || this.isBackgroundMuted() || !this.audio.paused || this.audio.ended) return;
    // A browser may still be rejecting the original automatic play attempt
    // when the first trusted click or keydown arrives. Don't discard the only
    // user activation just because that old promise has not settled yet.
    if (this.playPending) {
      this.generation++;
      this.playPending = null;
    }
    void this.play();
  }

  setVolume(value) { this.setMusicVolume(value); }

  setMusicVolume(value) {
    this.musicVolume = saveAudioVolume('music', value);
    this.masterVolume = this.musicVolume;
    this.audio.volume = this.musicVolume * this.duckAmount;
    this.onChange(this.title, '');
  }

  setMasterVolume(value) {
    // Compatibility for saved clients; the menu now controls music alone.
    this.setMusicVolume(value);
    try { localStorage.setItem('streetskate.masterVolume', String(this.masterVolume)); } catch {}
  }

  setBackgroundAudio(value) {
    this.backgroundAudio = saveBackgroundAudio(value);
    this._visibility();
  }

  duck(durationMs = 550, amount = .6, releaseMs = 120) {
    if (this.disposed) return;
    const now = Date.now(), hold = Math.max(80, Math.min(4500, Number(durationMs) || 550));
    const depth = Math.max(.25, Math.min(1, Number(amount) || .6));
    const release = Math.max(40, Math.min(500, Number(releaseMs) || 120));
    // Each reaction owns its hold and release. A shorter cue cannot truncate
    // applause, and a long crowd return cannot prolong a short contact voice.
    const request = { until: now + hold, amount: depth, release };
    (this.duckRequests ||= []).push(request);
    const cancel = () => { request.until = Math.min(request.until, Date.now()); request.release = Math.min(request.release, 80); };
    if (this.duckTimer) return cancel;
    let previous = now;
    const step = () => {
      if (this.disposed) return;
      const time = Date.now(), dt = Math.min(100, Math.max(1, time - previous)); previous = time;
      const level = request => 1 - (1 - request.amount) * Math.exp(-Math.max(0, time - request.until) / request.release);
      this.duckRequests = this.duckRequests.filter(request => 1 - level(request) >= .002);
      const target = Math.min(1, ...this.duckRequests.map(level));
      this.duckAmount = target < this.duckAmount
        ? this.duckAmount + (target - this.duckAmount) * (1 - Math.exp(-dt / 25))
        : target;
      if (Math.abs(target - this.duckAmount) < .002) this.duckAmount = target;
      this.audio.volume = this.musicVolume * this.duckAmount;
      if (!this.duckRequests.length && this.duckAmount === 1) { clearInterval(this.duckTimer); this.duckTimer = null; }
    };
    this.duckTimer = setInterval(step, 16);
    return cancel;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    clearInterval(this.duckTimer); this.duckTimer = null; this.duckRequests = [];
    this.audio.pause();
    this.audio.removeEventListener('ended', this._ended);
    this.audio.removeEventListener('error', this._error);
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    document.removeEventListener('visibilitychange', this._visibility);
    this.audio.removeAttribute?.('src');
    this.audio.load?.();
    this.queue.length = 0;
  }
}
