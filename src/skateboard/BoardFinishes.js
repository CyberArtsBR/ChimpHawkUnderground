export const DEFAULT_BOARD_FINISH = 6; // Orange

function finish(color, stops) {
  const colors = Object.freeze(stops);
  return Object.freeze({
    color,
    stops: colors,
    cssGradient: `linear-gradient(115deg, ${colors.map(
      value => '#' + value.toString(16).padStart(6, '0'),
    ).join(', ')})`,
  });
}

// Eight distinct gradient deck paints shared by 3D board and Build Your Line.
export const SKATEBOARD_FINISHES = Object.freeze([
  finish(0x858d98, [0x343943, 0x8994a5, 0xd8dde3]), // Steel grey
  finish(0xf2f2f2, [0x12141a, 0xf5f5f4, 0x181b21]), // White / black
  finish(0x9652ff, [0x2a105f, 0x9550ed, 0xf4a3ff]), // Purple
  finish(0x71de36, [0x165933, 0x70dd28, 0xe5ff7b]), // Lime
  finish(0xffd14f, [0x9e5c10, 0xffd63c, 0xfff4a6]), // Yellow
  finish(0x3484ff, [0x142d84, 0x2372f6, 0x9fefff]), // Blue
  finish(0xff913f, [0x92361a, 0xff8b26, 0xffd075]), // Orange
  finish(0xef3653, [0x71132f, 0xe5294e, 0xffa3a3]), // Red
]);

export function skateboardFinishByColor(color) {
  if (color === null || color === undefined) return null;
  const numericColor = Number(color);
  return SKATEBOARD_FINISHES.find(entry => entry.color === numericColor)
    || finish(numericColor, [numericColor, numericColor, numericColor]);
}
