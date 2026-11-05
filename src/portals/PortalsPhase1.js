import { PortalsGateway, PORTALS_MAPS, PORTALS_MODES, guestName, scoreForPortals, safePreferences } from './PortalsGateway.js';
import { GRAPHICS_PRESET_ORDER } from '../graphics/GraphicsSettings.js';
import { LOCATIONS } from '../game/LoadoutCatalog.js';
import { saveAudioVolume } from '../game/AudioSettings.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, symbol =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const cameraModes = ['follow', 'classic', 'fixed'];
const points = value => Math.round(Number(value) || 0).toLocaleString();

export class PortalsPhase1 {
  constructor(shell, sdk = globalThis.Portals) {
    this.shell = shell;
    this.gateway = new PortalsGateway(sdk);
    this.available = this.gateway.available;
    this.opened = false;
    this.loadingBoard = false;
    this.entries = [];
    this.status = 'Ready to skate.';
    this.mapId = 'skate-paradise';
    this.pending = null;
    this.cloudLoaded = false;
    this.restored = false;
    this.remotePreferences = null;
    this.syncTimer = null;
    this.saveSerial = Promise.resolve();
    this.identitySerial = 0;
    this.localName = '';
    try { this.localName = guestName(localStorage.getItem('streetskate.portalsGuestName')); } catch {}
    this.gateway.onIdentity = () => {
      this.status = this.gateway.signedIn ? 'Connected to Portals.' : 'Playing as a guest.';
      void this.restoreFromCloud();
      if (this.opened) void this.refreshBoard();
      this.notify();
    };
    if (this.available) {
      this.overlay = document.createElement('section');
      this.overlay.id = 'portals-phase1';
      this.overlay.hidden = true;
      this.overlay.setAttribute('role', 'dialog');
      this.overlay.setAttribute('aria-modal', 'true');
      this.overlay.setAttribute('aria-label', 'Portals rankings and player profile');
      document.body.append(this.overlay);
      this.overlay.addEventListener('click', event => {
        const action = event.target.closest('[data-portals-action]')?.dataset.portalsAction;
        if (action) void this.act(action, event.target.closest('[data-portals-action]'));
      });
    }
  }
  get isOpen() { return this.opened; }
  notify() {
    if (this.opened) this.render();
    if (this.shell.phase !== 'playing' && this.shell.phase !== 'timeup') this.shell.render();
  }
  async start() {
    if (!this.available) return;
    const connected = await this.gateway.connect();
    if (!connected) { this.available = false; this.overlay.hidden = true; this.notify(); return; }
    this.status = this.gateway.signedIn ? 'Connected to Portals.' : 'Guest scores require a nickname.';
    this.gateway.track('skate_portals_ready', { signedIn: this.gateway.signedIn });
    await this.restoreFromCloud();
    this.notify();
  }
  onGameReady() { this.tryApplyCloud(); }
  preferences() {
    return safePreferences({
      camera: cameraModes[this.shell.cameraIndex],
      graphics: GRAPHICS_PRESET_ORDER[this.shell.graphicsIndex],
      bloomEnabled: this.shell.bloomEnabled, sound: this.shell.sound,
      musicVolume: this.shell.music.musicVolume,
      effectsVolume: this.shell.effectsVolume,
      riderId: this.shell.heroes[this.shell.heroIndex]?.id,
      boardIndex: this.shell.boardIndex,
      locationId: LOCATIONS[this.shell.locationIndex]?.id,
    });
  }
  tryApplyCloud() {
    if (this.restored || !this.cloudLoaded || !this.gateway.signedIn || !this.shell.ready || this.shell.phase !== 'title') return;
    this.restored = true;
    const data = this.remotePreferences;
    if (!data) return;
    const shell = this.shell;
    if (data.camera) shell.cameraIndex = cameraModes.indexOf(data.camera);
    if (typeof data.bloomEnabled === 'boolean') shell.bloomEnabled = data.bloomEnabled;
    if (data.graphics && GRAPHICS_PRESET_ORDER.includes(data.graphics)) {
      shell.graphicsIndex = GRAPHICS_PRESET_ORDER.indexOf(data.graphics);
    }
    if (data.graphics || data.bloomEnabled !== undefined) shell.actions.graphics?.(GRAPHICS_PRESET_ORDER[shell.graphicsIndex]);
    if (typeof data.sound === 'boolean') { shell.sound = data.sound; shell.actions.sound?.(data.sound); }
    const musicVolume = data.musicVolume ?? data.masterVolume;
    if (musicVolume !== undefined) shell.music.setMusicVolume(musicVolume);
    if (data.effectsVolume !== undefined) {
      shell.effectsVolume = saveAudioVolume('effects', data.effectsVolume);
      shell.actions.effectsVolume?.(shell.effectsVolume);
    }
    if (data.riderId) {
      const i = shell.heroes.findIndex(hero => hero.id === data.riderId);
      if (i >= 0) shell.heroIndex = i;
    }
    if (data.boardIndex !== undefined) {
      shell.boardIndex = data.boardIndex;
      shell.finishIndex = data.boardIndex;
      shell.actions.deck?.(data.boardIndex);
    }
    if (data.locationId) {
      const i = LOCATIONS.findIndex(map => map.id === data.locationId && map.available);
      if (i >= 0) shell.locationIndex = i;
    }
    if (data.camera) shell.actions.camera?.(data.camera);
    shell.render();
  }
  async restoreFromCloud() {
    const serial = ++this.identitySerial;
    this.cloudLoaded = false; this.restored = false; this.remotePreferences = null;
    if (!this.gateway.signedIn) return;
    try {
      const data = await this.gateway.loadPreferences();
      if (serial !== this.identitySerial || !this.gateway.signedIn) return;
      this.remotePreferences = data;
      this.cloudLoaded = true;
      this.tryApplyCloud();
    } catch (error) {
      if (serial !== this.identitySerial) return;
      this.cloudLoaded = true;
      this.status = 'Cloud load unavailable: ' + (error?.message || 'Try again later');
      this.notify();
    }
  }
  settingsChanged() {
    if (!this.gateway.signedIn || !this.cloudLoaded || !this.restored) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      const currentId = this.gateway.player?.playerId;
      const settings = this.preferences();
      this.saveSerial = this.saveSerial.catch(() => {}).then(async () => {
        if (!this.gateway.signedIn || currentId !== this.gateway.player?.playerId) return;
        try { await this.gateway.savePreferences(settings); }
        catch (error) {
          this.status = 'Cloud sync failed; local settings still work.';
          if (this.opened) this.render();
          console.warn('Portals save failed', error);
        }
      });
    }, 700);
  }
  async finishedRun(summary, mapId) {
    if (!this.available || !PORTALS_MODES[mapId]) return;
    const score = scoreForPortals(summary?.finalScore ?? summary?.totalScore);
    if (score === null) return;
    this.mapId = mapId;
    this.pending = { score, mapId };
    this.gateway.track('skate_run_complete', { map: mapId, score, rider: summary?.riderName || '' });
    if (this.gateway.signedIn || this.localName) await this.submitPending();
    else { this.status = 'Run complete! Enter a guest nickname to post your score.'; this.notify(); }
  }
  async submitPending() {
    if (!this.pending || !this.available) return;
    const current = this.pending;
    try {
      await this.gateway.submit(current.score, current.mapId, this.localName);
      if (this.pending === current) this.pending = null;
      this.status = 'Score posted: ' + points(current.score) + ' points!';
      if (this.opened) await this.refreshBoard();
    } catch (error) {
      this.status = 'Score not posted: ' + (error?.message || 'Network error');
    }
    this.notify();
  }
  async refreshBoard() {
    if (!this.available || !this.opened) return;
    const mapId = this.mapId;
    this.loadingBoard = true; this.render();
    try {
      const entries = await this.gateway.leaderboard(mapId);
      if (mapId === this.mapId && this.opened) this.entries = entries;
    } catch (error) {
      if (mapId === this.mapId) { this.entries = []; this.status = 'Leaderboard unavailable: ' + (error?.message || 'Try later'); }
    } finally {
      if (mapId === this.mapId) { this.loadingBoard = false; this.render(); }
    }
  }
  open(mapId) {
    if (!this.available) return;
    this.mapId = PORTALS_MODES[mapId] ? mapId : (LOCATIONS[this.shell.locationIndex]?.id || 'skate-paradise');
    this.opened = true; this.overlay.hidden = false;
    this.render(); void this.refreshBoard();
  }
  close() { this.opened = false; if (this.overlay) this.overlay.hidden = true; }
  async act(action, element) {
    if (action === 'close') { this.close(); return; }
    if (action === 'map') { this.mapId = element.dataset.map; this.entries = []; await this.refreshBoard(); return; }
    if (action === 'refresh') { await this.refreshBoard(); return; }
    if (action === 'login') {
      try { await this.gateway.signIn(); this.status = 'Signed in.'; }
      catch (error) { this.status = 'Sign-in cancelled or unavailable.'; console.warn('Portals sign-in', error); }
      this.notify(); return;
    }
    if (action === 'nickname') {
      const input = this.overlay.querySelector('[data-portals-nickname]');
      const validated = guestName(input?.value);
      if (!validated) { this.status = 'Use 1–24 letters, numbers, spaces, _ or -.'; this.render(); return; }
      this.localName = validated;
      try { localStorage.setItem('streetskate.portalsGuestName', validated); } catch {}
      this.status = 'Guest nickname saved.';
      if (this.pending) await this.submitPending();
      else this.render();
      return;
    }
    if (action === 'submit') { await this.submitPending(); return; }
  }
  render() {
    if (!this.opened) return;
    const player = this.gateway.player;
    const identity = this.gateway.signedIn ? escapeHtml(player?.displayName || 'Portals player') : 'Guest skater';
    const rows = this.entries.map(entry => '<li><span>#' + escapeHtml(entry.rank) + '</span><strong>' +
      escapeHtml(entry.displayName || 'Skater') + '</strong><b>' + points(entry.score) + '</b></li>').join('');
    const tabs = PORTALS_MAPS.map(map => '<button type="button" data-portals-action="map" data-map="' +
      map.id + '" aria-pressed="' + (map.id === this.mapId) + '">' + escapeHtml(map.label) + '</button>').join('');
    this.overlay.innerHTML = '<div class="portals-phase1-shade" data-portals-action="close"></div>' +
      '<article class="portals-phase1-card"><header><div><small>CHIMP HAWK UNDERGROUND / PORTALS</small><h2>WORLD RANKINGS</h2>' +
      '<p>Playing as <strong>' + identity + '</strong></p></div><button type="button" data-portals-action="close" aria-label="Close rankings">✕</button></header>' +
      '<nav aria-label="Ranking map">' + tabs + '</nav>' +
      '<p class="portals-phase1-status" role="status">' + escapeHtml(this.status) + '</p>' +
      '<div class="portals-phase1-body"><h3>TOP 10 · 90 SECOND RUNS</h3>' +
      (this.loadingBoard ? '<p>Loading rankings…</p>' :
      '<ol>' + (rows || '<li>Be the first skater on this map!</li>') + '</ol>') + '</div>' +
      (!this.gateway.signedIn ?
        '<div class="portals-phase1-login"><p>Sign in to sync your settings across devices, or submit a score as a guest.</p>' +
        '<button type="button" data-portals-action="login">SIGN IN WITH PORTALS</button>' +
        '<label>GUEST NICKNAME <input data-portals-nickname maxlength="24" autocomplete="nickname" placeholder="Skater" value="' +
        escapeHtml(this.localName) + '"></label><button type="button" data-portals-action="nickname">SAVE NICKNAME</button></div>' :
        '<p class="portals-phase1-cloud">Cloud settings sync enabled for your Portals account.</p>') +
      (this.pending ? '<p>Unposted run: <strong>' + points(this.pending.score) +
        '</strong> pts <button type="button" data-portals-action="submit">POST SCORE</button></p>' : '') +
      '<footer><button type="button" data-portals-action="refresh">REFRESH</button><button type="button" data-portals-action="close">BACK TO GAME</button></footer></article>';
  }
  dispose() { clearTimeout(this.syncTimer); this.gateway.dispose(); this.overlay?.remove(); }
}
