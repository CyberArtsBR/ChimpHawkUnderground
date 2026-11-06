// Camera cycle order is shared by the pause menu, toolbar and gamepad.
// Follow Classic 2 (id 'follow-test') is the default camera and first in the cycle.
export const DEFAULT_CAMERA_MODE = 'follow-test';
export const CAMERA_MODES = Object.freeze(['follow-test', 'follow', 'follow-close', 'follow-low', 'classic', 'fixed']);
export const CAMERA_LABELS = Object.freeze({
  follow: 'Follow',
  'follow-test': 'Follow Classic 2',
  'follow-close': 'Follow Close',
  'follow-low': 'Follow Low',
  classic: 'Classic',
  fixed: 'Fixed',
});

// Keep the original 1–3 shortcuts and any user bindings intact.
export const CAMERA_SHORTCUTS = Object.freeze(['follow', 'classic', 'fixed']);
