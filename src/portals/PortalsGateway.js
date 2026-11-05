export const PORTALS_MODES = Object.freeze({
  'skate-paradise': 'paradise-90s',
  orbit: 'orbit-90s',
  'grand-warehouse': 'warehouse-90s',
});

export const PORTALS_MAPS = Object.freeze([
  { id: 'skate-paradise', label: 'Skate Paradise', mode: PORTALS_MODES['skate-paradise'] },
  { id: 'orbit', label: 'ORBIT', mode: PORTALS_MODES.orbit },
  { id: 'grand-warehouse', label: 'Grand Warehouse', mode: PORTALS_MODES['grand-warehouse'] },
]);

export function guestName(value) {
  const name = String(value ?? '').trim();
  return /^[A-Za-z0-9 _-]{1,24}$/.test(name) ? name : '';
}

export function scoreForPortals(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= Number.MAX_SAFE_INTEGER
    ? Math.round(score) : null;
}

export function safePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = {};
  if (['follow', 'classic', 'fixed'].includes(value.camera)) result.camera = value.camera;
  if (typeof value.graphics === 'string' && /^[a-z0-9-]{1,32}$/i.test(value.graphics)) result.graphics = value.graphics;
  if (typeof value.bloomEnabled === 'boolean') result.bloomEnabled = value.bloomEnabled;
  if (typeof value.sound === 'boolean') result.sound = value.sound;
  if (Number.isFinite(value.masterVolume) && value.masterVolume >= 0 && value.masterVolume <= 1) result.masterVolume = value.masterVolume;
  for (const channel of ['musicVolume', 'effectsVolume']) {
    if (Number.isFinite(value[channel]) && value[channel] >= 0 && value[channel] <= 1) result[channel] = value[channel];
  }
  if (['heretic', 'adolescent', 'anchor', 'tuxr'].includes(value.riderId)) result.riderId = value.riderId;
  if (Number.isInteger(value.boardIndex) && value.boardIndex >= 0 && value.boardIndex < 8) result.boardIndex = value.boardIndex;
  if (Object.hasOwn(PORTALS_MODES, value.locationId)) result.locationId = value.locationId;
  return result;
}

export class PortalsGateway {
  constructor(sdk = globalThis.Portals) {
    this.sdk = sdk;
    this.player = null;
    this.session = null;
    this.onIdentity = () => {};
    this.offIdentity = null;
    this.error = '';
  }
  get available() { return typeof this.sdk?.ready === 'function'; }
  get signedIn() { return Boolean(this.player?.playerId); }
  async connect() {
    if (!this.available) return false;
    try {
      this.session = await this.sdk.ready();
      this.player = this.session?.player || (await this.sdk.getPlayer());
      this.offIdentity = this.sdk.identity?.onChange?.(player => {
        this.player = player;
        this.onIdentity(player);
      }) || null;
      return true;
    } catch (error) {
      this.error = String(error?.message || 'Portals is unavailable');
      return false;
    }
  }
  async signIn() {
    if (!this.sdk?.identity?.requestLogin) throw new Error('Portals sign-in unavailable');
    this.player = await this.sdk.identity.requestLogin();
    this.onIdentity(this.player);
    return this.player;
  }
  async loadPreferences() {
    if (!this.signedIn) return null;
    const saved = await this.sdk.loadState();
    if (!saved || saved.schemaVersion !== 1) return null;
    return safePreferences(saved.preferences);
  }
  async savePreferences(preferences) {
    if (!this.signedIn) return false;
    await this.sdk.saveState({ schemaVersion: 1, preferences: safePreferences(preferences) || {} });
    return true;
  }
  async submit(score, mapId, name = '') {
    const mode = PORTALS_MODES[mapId], value = scoreForPortals(score);
    if (!mode || value === null) throw new Error('Invalid timed run score or map');
    const options = this.signedIn ? undefined : { name: guestName(name) };
    if (options && !options.name) throw new Error('Enter a guest nickname (1–24 letters, numbers, spaces, _ or -)');
    await this.sdk.submitScore(value, mode, options);
    return { score: value, mode };
  }
  async leaderboard(mapId, limit = 10) {
    const mode = PORTALS_MODES[mapId];
    if (!mode) throw new Error('Unknown location');
    const board = await this.sdk.getLeaderboard({ mode, limit });
    return Array.isArray(board?.entries) ? board.entries : [];
  }
  track(event, properties = {}) {
    try { this.sdk?.track?.(event, properties); } catch { /* Optional analytics cannot interrupt gameplay. */ }
  }
  dispose() { this.offIdentity?.(); this.offIdentity = null; }
}
