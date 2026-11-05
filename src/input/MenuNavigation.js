// Deterministic menu navigation independent of viewport, DOM order and scroll position.
// Loadout regions are logical columns navigated with a keyboard or gamepad.
const GROUPS = { hero: 0, upload: 0, board: 1, location: 2, back: 3, confirmLoadout: 3 };
const groupOf = node => Object.hasOwn(GROUPS, node?.dataset?.action) ? GROUPS[node.dataset.action] : null;
const rect = node => {
  const r = node.getBoundingClientRect?.() || {};
  const x = Number(r.left) || 0, y = Number(r.top) || 0;
  const w = Math.max(0, Number(r.width) || 0), h = Math.max(0, Number(r.height) || 0);
  return { x:x+w/2, y:y+h/2, w, h };
};
const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);

/** Return an index, not a DOM element, so callers retain a single roving focus. */
export function nextMenuIndex(buttons, selected, axis, sign, loadout = false) {
  if (!buttons?.length) return 0;
  const origin = ((selected % buttons.length) + buttons.length) % buttons.length;
  if (!['x','y'].includes(axis) || ![-1,1].includes(sign)) return origin;
  const current = buttons[origin], start = rect(current), group = loadout ? groupOf(current) : null;
  let best = -1, bestScore = Infinity;
  // Prefer the next *aligned* control within its logical region. This works
  // with two-column grids, single-column layouts and responsive CSS reflow.
  for (let i=0; i<buttons.length; i++) {
    if (i===origin || (group!==null && groupOf(buttons[i])!==group)) continue;
    const target = rect(buttons[i]);
    const primary = (axis==='x'?target.x-start.x:target.y-start.y)*sign;
    const secondary = axis==='x'?target.y-start.y:target.x-start.x;
    const side = axis==='x'?Math.max(start.h,target.h):Math.max(start.w,target.w);
    if (primary <= 2 || Math.abs(secondary) > Math.max(22,side*(axis==='y' ? 1.1 : 0.78))) continue;
    const score = primary + Math.abs(secondary)*1.65;
    if (score < bestScore) { best=i; bestScore=score; }
  }
  if (best>=0) return best;
  // At a region boundary, move to the adjacent region even if responsive
  // CSS puts it on another row or outside the currently scrolled viewport.
  if (group!==null) {
    for (let next=group+sign; next>=0 && next<=3; next+=sign) {
      const candidates = buttons.map((node,i)=>({node,i})).filter(({node})=>groupOf(node)===next);
      if (!candidates.length) continue;
      if (axis==='y') {
        // Enter the nearest row at the leading edge of the next section.
        const edge = sign>0
          ? Math.min(...candidates.map(({node})=>rect(node).y))
          : Math.max(...candidates.map(({node})=>rect(node).y));
        candidates.sort((a,b) => {
          const da=rect(a.node), db=rect(b.node);
          return (Math.abs(da.y-edge)*3+Math.abs(da.x-start.x))
            -(Math.abs(db.y-edge)*3+Math.abs(db.x-start.x));
        });
      } else {
        candidates.sort((a,b)=>Math.abs(rect(a.node).y-start.y)-Math.abs(rect(b.node).y-start.y)
          || distance(rect(a.node),start)-distance(rect(b.node),start));
      }
      return candidates[0].i;
    }
    return origin;
  }
  // Non-loadout menus (title, pause, options): preserve cyclic navigation.
  return axis==='y' ? (origin+sign+buttons.length)%buttons.length : origin;
}
