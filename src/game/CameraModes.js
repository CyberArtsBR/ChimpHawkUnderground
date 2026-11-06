// Camera cycle order is shared by the pause menu, toolbar and gamepad.
export const CAMERA_MODES = Object.freeze(['follow', 'follow-test', 'follow-close', 'follow-low', 'classic', 'fixed']);
export const CAMERA_LABELS = Object.freeze({
  follow: 'Follow',
  'follow-test': 'Follow Test',
  'follow-close': 'Follow Close',
  'follow-low': 'Follow Low',
  classic: 'Classic',
  fixed: 'Fixed',
});

// Keep the original 1–3 shortcuts and any user bindings intact.
export const CAMERA_SHORTCUTS = Object.freeze(['follow', 'classic', 'fixed']);
