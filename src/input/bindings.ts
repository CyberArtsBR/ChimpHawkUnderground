// Classic control scheme: a 1:1 port of v1's ControlBindings defaults.
// Changing a default here changes how veteran players skate, so the test
// suite pins every binding to the v1 table.

export type ActionId =
  | 'up' | 'down' | 'left' | 'right'
  | 'ollie' | 'flip' | 'grab' | 'grind'
  | 'spinLeft' | 'spinRight' | 'brake' | 'vertExit' | 'switchStance'
  | 'cameraMode' | 'reset' | 'practiceMark' | 'practiceReturn';

export interface ControlAction {
  readonly id: ActionId;
  readonly label: string;
  readonly keyboard: readonly string[];
  readonly gamepad: number | null;
}

export interface Binding { keyboard: string[]; gamepad: number | null }
export type Bindings = Record<ActionId, Binding>;

export const BINDINGS_KEY = 'chimphawk.controlBindings.v1';

/** Menu navigation keys stay fixed so a rebind can never strand a player. */
export const RESERVED_KEYS = new Set(['Escape', 'Enter', 'NumpadEnter', 'Tab', 'Backspace',
  'KeyH', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'MetaLeft', 'MetaRight']);
/** Select, Start and Home on a standard gamepad. */
export const RESERVED_BUTTONS = new Set([8, 9, 16]);

const action = (id: ActionId, label: string, keyboard: string[], gamepad: number | null = null): ControlAction =>
  Object.freeze({ id, label, keyboard: Object.freeze([...keyboard]), gamepad });

export const CONTROL_ACTIONS: readonly ControlAction[] = Object.freeze([
  action('up', 'Forward / trick up', ['KeyW'], 12),
  action('down', 'Back / trick down', ['KeyS'], 13),
  action('left', 'Steer / trick left', ['KeyA'], 14),
  action('right', 'Steer / trick right', ['KeyD'], 15),
  action('ollie', 'Ollie / charge', ['Space'], 0),
  action('flip', 'Flip', ['ArrowLeft'], 2),
  action('grab', 'Grab', ['ArrowRight'], 1),
  action('grind', 'Grind', ['ArrowUp'], 3),
  action('spinLeft', 'Spin left', ['KeyQ'], 4),
  action('spinRight', 'Spin right', ['KeyE'], 5),
  action('brake', 'Brake', ['ShiftLeft', 'ShiftRight']),
  action('vertExit', 'Vert exit', ['ControlLeft'], 6),
  action('switchStance', 'Switch stance', ['ControlRight'], 7),
  action('cameraMode', 'Camera mode', ['KeyC'], 11),
  action('reset', 'Reset rider', ['KeyR']),
  action('practiceMark', 'Set practice marker', ['KeyM']),
  action('practiceReturn', 'Return to marker', ['KeyN']),
]);

export function defaultBindings(): Bindings {
  return Object.fromEntries(CONTROL_ACTIONS.map(a => [a.id, { keyboard: [...a.keyboard], gamepad: a.gamepad }])) as Bindings;
}

export function validKey(code: unknown): code is string {
  return typeof code === 'string'
    && /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash)$/.test(code)
    && !RESERVED_KEYS.has(code);
}

export type BindResult = { ok: true; bindings: Bindings } | { ok: false; error: string; conflict?: ActionId };

export function withBinding(bindings: Bindings, id: ActionId, device: 'keyboard' | 'gamepad', value: string | number | null): BindResult {
  if (!bindings[id]) return { ok: false, error: 'Unknown control.' };
  if (device === 'keyboard' && !validKey(value)) return { ok: false, error: 'That key is reserved for menus or the browser.' };
  if (device === 'gamepad' && value !== null
    && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 15 || RESERVED_BUTTONS.has(value))) {
    return { ok: false, error: 'Start / Select / Home stay assigned to menus.' };
  }
  for (const entry of CONTROL_ACTIONS) {
    if (entry.id === id) continue;
    const bound = bindings[entry.id];
    const clash = device === 'keyboard' ? bound.keyboard.includes(value as string) : value !== null && bound.gamepad === value;
    if (clash) return { ok: false, conflict: entry.id, error: `Already used by ${entry.label}. Choose another input, or reset controls.` };
  }
  const next = Object.fromEntries(CONTROL_ACTIONS.map(a => [a.id, { keyboard: [...bindings[a.id].keyboard], gamepad: bindings[a.id].gamepad }])) as Bindings;
  if (device === 'keyboard') next[id].keyboard = [value as string];
  else next[id].gamepad = value as number | null;
  return { ok: true, bindings: next };
}

export function readBindings(storage: Pick<Storage, 'getItem'> | null | undefined = globalThis.localStorage): Bindings {
  const defaults = defaultBindings();
  try {
    const saved = JSON.parse(storage?.getItem(BINDINGS_KEY) || 'null');
    if (!saved || saved.version !== 1 || !saved.actions) return defaults;
    const keys = new Set<string>(), buttons = new Set<number>();
    const result = defaultBindings();
    for (const a of CONTROL_ACTIONS) {
      const entry = saved.actions[a.id];
      if (!entry || !Array.isArray(entry.keyboard) || entry.keyboard.length < 1 || entry.keyboard.length > 2) return defaults;
      if (entry.keyboard.some((k: unknown) => !validKey(k) || keys.has(k as string))) return defaults;
      if (entry.gamepad !== null && (!Number.isInteger(entry.gamepad) || entry.gamepad < 0 || entry.gamepad > 15
        || RESERVED_BUTTONS.has(entry.gamepad) || buttons.has(entry.gamepad))) return defaults;
      entry.keyboard.forEach((k: string) => keys.add(k));
      if (entry.gamepad !== null) buttons.add(entry.gamepad);
      result[a.id] = { keyboard: [...entry.keyboard], gamepad: entry.gamepad };
    }
    return result;
  } catch {
    return defaults;
  }
}

export function saveBindings(bindings: Bindings, storage: Pick<Storage, 'setItem'> | null | undefined = globalThis.localStorage): void {
  try { storage?.setItem(BINDINGS_KEY, JSON.stringify({ version: 1, actions: bindings })); } catch { /* private mode */ }
}

export function keyLabel(code: string): string {
  const named: Record<string, string> = {
    Space: 'Space', ArrowLeft: '← arrow', ArrowRight: '→ arrow', ArrowUp: '↑ arrow', ArrowDown: '↓ arrow',
    ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
  };
  return named[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}
