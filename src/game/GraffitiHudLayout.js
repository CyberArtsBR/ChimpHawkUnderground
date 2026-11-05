/**
 * Fit owner-authored bitmap graffiti inside the *actual viewport*, not a
 * line-height-based box. A long gold/fire score must never lose its digits.
 * Trigger on a new trick, image decoding, and resize; never per animation frame.
 */
export function fitGraffitiHud(node, viewportWidth, viewportHeight) {
  if (!node) return null;
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 1280;
  const height = Number.isFinite(viewportHeight) ? viewportHeight : 720;
  const allowedWidth = Math.max(1, width - 40);
  const baseHeight = Math.max(23, Math.min(40, width * 0.031, height * 0.065));
  // Always reset before measuring: a previous long score can otherwise make
  // every subsequent, shorter combo unnecessarily small.
  node.style.setProperty('--letter-height', `${baseHeight}px`);
  node.style.maxWidth = `${allowedWidth}px`;
  const words = [...node.querySelectorAll('.graffiti-word')];
  if (!words.length) return { height: baseHeight, width: allowedWidth };
  // scrollWidth includes horizontally protruding sprite letters and is
  // reliable even when the parent flex container has wrapped onto two rows.
  const widest = Math.max(...words.map(word => word.scrollWidth || 0));
  const size = widest > allowedWidth - 24
    ? Math.max(12, baseHeight * (allowedWidth - 24) / widest)
    : baseHeight;
  node.style.setProperty('--letter-height', `${size}px`);
  return { height: size, width: allowedWidth };
}
