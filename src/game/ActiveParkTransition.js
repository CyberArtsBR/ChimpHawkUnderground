import { gameAssetUrl } from './AssetPaths.js';
import * as THREE from 'three';

export const ACTIVE_PARK_ASSET = gameAssetUrl('/assets/park/halfnew.glb');
export const LEGACY_VISUAL_PARK_ASSET = gameAssetUrl('/assets/park/insanity-inspired-park.glb');
export const LEGACY_COLLISION_ASSET = gameAssetUrl('/assets/park/park-collision.glb');

/**
 * Park transition routing:
 * - visual park request -> user's new halfpipenew.glb;
 * - collision request stays on the optimized park-collision.glb.
 *
 * The new halfpipe's extra collision is added separately by ExtendedParkCollision,
 * so we never feed the entire 5 MB visual art asset into ParkCollision again.
 */
export function resolveActiveParkUrl(url = '') {
  const source = String(url || '');
  return source.endsWith(LEGACY_VISUAL_PARK_ASSET)
    ? ACTIVE_PARK_ASSET
    : source;
}

export function activateParkTransition() {
  THREE.DefaultLoadingManager.setURLModifier(resolveActiveParkUrl);
  globalThis.__STREETSKATE_ACTIVE_PARK__ = ACTIVE_PARK_ASSET;
  globalThis.__STREETSKATE_COLLISION_BASE__ = LEGACY_COLLISION_ASSET;
  return ACTIVE_PARK_ASSET;
}

// The composition root explicitly loads and assembles both sectors. Do not
// rewrite the legacy reference URL globally: it is needed for matching collision.
