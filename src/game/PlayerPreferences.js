export const PLAYER_PREFERENCES_KEY = 'streetskate.playerPreferences.v1';
export const PLAYER_PREFERENCE_DEFAULTS = Object.freeze({
  uiScale: 1, renderScale: 1, highContrast: false, cameraDistance: 1, cameraFov: 58,
  speedFov: 1, liquid: true, performance: false,
});
export const PLAYER_PREFERENCE_RANGES = Object.freeze({
  uiScale: [.85, 1.5, .1], renderScale:[.6,1.25,.05], cameraDistance: [.8, 1.3, .05],
  cameraFov: [48, 80, 5], speedFov: [0, 2, .25],
});
export function normalizePlayerPreferences(value = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(PLAYER_PREFERENCE_DEFAULTS)) {
    const range = PLAYER_PREFERENCE_RANGES[key];
    result[key] = range && typeof value[key] === 'number' && Number.isFinite(value[key])
      ? Math.min(range[1], Math.max(range[0], value[key]))
      : typeof fallback === 'boolean' && typeof value[key] === 'boolean' ? value[key] : fallback;
  }
  return result;
}
export function readPlayerPreferences(storage) {
  try { if(storage===undefined)storage=globalThis.localStorage;return normalizePlayerPreferences(JSON.parse(storage?.getItem(PLAYER_PREFERENCES_KEY) || '{}')); }
  catch { return { ...PLAYER_PREFERENCE_DEFAULTS }; }
}
export function savePlayerPreferences(value, storage) {
  const preferences = normalizePlayerPreferences(value);
  try { if(storage===undefined)storage=globalThis.localStorage;storage?.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(preferences)); } catch {}
  return preferences;
}
export function applyPlayerPreferences(preferences, root = globalThis.document?.documentElement) {
  const settings = normalizePlayerPreferences(preferences);
  root?.style?.setProperty('--ui-scale', String(settings.uiScale));
  if (root?.dataset) root.dataset.highContrast = String(settings.highContrast);
  return settings;
}
