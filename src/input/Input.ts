// Keyboard + standard gamepad reader. Behaviour matches v1's SkateInput.read():
// same dead zones, same edge rules (a held key never re-fires), same
// direction taps from keys, D-pad and left-stick flicks.
import { type ActionId, type Bindings, readBindings, saveBindings, defaultBindings, withBinding } from './bindings';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface InputFrame {
  steer: number;          // -1 left … 1 right
  drive: number;          // -1 back … 1 forward
  directionTaps: Direction[];
  brake: boolean;
  ollieHeld: boolean;
  olliePressed: boolean;
  ollieReleased: boolean;
  flipPressed: boolean;
  grabPressed: boolean;
  grabHeld: boolean;
  grindPressed: boolean;
  grindHeld: boolean;
  spin: number;           // -1 Q/LB … 1 E/RB
  vertExit: boolean;
  switchStancePressed: boolean;
  pausePressed: boolean;
  cameraModePressed: boolean;
  reset: boolean;
  practiceMark: boolean;
  practiceReturn: boolean;
  cameraX: number;
  cameraY: number;
  mouseDX: number;
  mouseDY: number;
  cameraActive: boolean;
}

export const STICK_DEAD_ZONES = [0.08, 0.16, 0.24] as const;
const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Turns analog stick flicks into discrete taps (activation 0.65, re-arm under 0.30). */
export class DirectionTapDetector {
  private xState = 0;
  private yState = 0;
  constructor(private activation = 0.65, private neutral = 0.30) {}
  reset(): void { this.xState = 0; this.yState = 0; }
  update(x = 0, y = 0): Direction[] {
    const taps: Direction[] = [];
    this.xState = this.axis(x, this.xState, 'left', 'right', taps);
    this.yState = this.axis(y, this.yState, 'down', 'up', taps);
    return taps;
  }
  private axis(value: number, state: number, neg: Direction, pos: Direction, taps: Direction[]): number {
    if (state !== 0) return Math.abs(value) <= this.neutral ? 0 : state;
    if (value >= this.activation) { taps.push(pos); return 1; }
    if (value <= -this.activation) { taps.push(neg); return -1; }
    return 0;
  }
}

export function emptyFrame(): InputFrame {
  return {
    steer: 0, drive: 0, directionTaps: [], brake: false,
    ollieHeld: false, olliePressed: false, ollieReleased: false,
    flipPressed: false, grabPressed: false, grabHeld: false, grindPressed: false, grindHeld: false,
    spin: 0, vertExit: false, switchStancePressed: false, pausePressed: false, cameraModePressed: false,
    reset: false, practiceMark: false, practiceReturn: false,
    cameraX: 0, cameraY: 0, mouseDX: 0, mouseDY: 0, cameraActive: false,
  };
}

type PadButtons = Record<string, boolean>;

export class Input {
  bindings: Bindings;
  stickDeadZone: number;
  enabled = true;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private padPrevious: PadButtons = {};
  private padIdentity: string | null = null;
  private taps = new DirectionTapDetector();
  private mouseDX = 0;
  private mouseDY = 0;
  private pointerLook = false;

  constructor(private element: HTMLElement) {
    this.bindings = readBindings();
    let saved = NaN;
    try { saved = Number(localStorage.getItem('chimphawk.stickDeadZone')); } catch { /* ignore */ }
    this.stickDeadZone = (STICK_DEAD_ZONES as readonly number[]).includes(saved) ? saved : 0.16;
    window.addEventListener('keydown', this.onDown, { passive: false });
    window.addEventListener('keyup', this.onUp, { passive: false });
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('pointermove', this.onPointerMove);
  }

  private onDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!this.enabled || /INPUT|TEXTAREA|SELECT/.test(target?.tagName || '') || target?.isContentEditable) return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.ctrlKey && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR'].includes(e.code)) e.preventDefault();
    if (!e.repeat && !this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    if (this.enabled && PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (this.keys.has(e.code)) this.released.add(e.code);
    this.keys.delete(e.code);
  };
  private onBlur = () => this.clear();
  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled || e.button !== 0) return;
    this.pointerLook = true;
    this.element.setPointerCapture?.(e.pointerId);
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.type !== 'pointercancel' && e.button !== 0) return;
    this.pointerLook = false;
    if (this.element.hasPointerCapture?.(e.pointerId)) this.element.releasePointerCapture(e.pointerId);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.enabled || !this.pointerLook) return;
    this.mouseDX += e.movementX || 0;
    this.mouseDY += e.movementY || 0;
  };

  clear(): void {
    this.keys.clear(); this.pressed.clear(); this.released.clear();
    this.taps.reset();
    this.mouseDX = 0; this.mouseDY = 0; this.pointerLook = false;
  }

  bind(id: ActionId, device: 'keyboard' | 'gamepad', value: string | number | null) {
    const result = withBinding(this.bindings, id, device, value);
    if (result.ok) { this.bindings = result.bindings; saveBindings(this.bindings); this.clear(); }
    return result;
  }

  resetBindings(): void { this.bindings = defaultBindings(); saveBindings(this.bindings); this.clear(); }

  /** Read one frame of input. Call exactly once per rendered frame. */
  read({ practice = false } = {}): InputFrame {
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected) || null;
    const identity = pad ? `${pad.index}:${pad.id}` : null;
    const padChanged = identity !== this.padIdentity;
    this.padIdentity = identity;
    const dead = this.stickDeadZone;
    const axis = (v: number | undefined) => {
      const value = v || 0;
      return Math.abs(value) < dead ? 0 : Math.sign(value) * (Math.abs(value) - dead) / (1 - dead);
    };
    const b = this.bindings;
    const held = (...codes: string[]) => codes.some(c => this.keys.has(c));
    const just = (...codes: string[]) => codes.some(c => this.pressed.has(c));
    const heldAction = (id: ActionId) => held(...b[id].keyboard);
    const pressedAction = (id: ActionId) => just(...b[id].keyboard);
    const releasedAction = (id: ActionId) => b[id].keyboard.some(c => this.released.has(c));
    const padAction = (id: ActionId) => {
      const index = b[id].gamepad;
      return index !== null && !!pad?.buttons[index]?.pressed;
    };

    const buttons: PadButtons = {
      ollie: padAction('ollie'), grab: padAction('grab'), flip: padAction('flip'), grind: padAction('grind'),
      spinLeft: padAction('spinLeft'), spinRight: padAction('spinRight'), vertExit: padAction('vertExit'),
      switchStance: padAction('switchStance'), pause: !!pad?.buttons[9]?.pressed, cameraMode: padAction('cameraMode'),
      dpadUp: padAction('up'), dpadDown: padAction('down'), dpadLeft: padAction('left'), dpadRight: padAction('right'),
      brake: padAction('brake'), reset: padAction('reset'),
      practiceMark: padAction('practiceMark'), practiceReturn: padAction('practiceReturn'),
    };
    // A reconnect inherits the physical held state instead of inventing a press.
    if (padChanged) this.padPrevious = { ...buttons };
    const edge = (k: string) => buttons[k] && !this.padPrevious[k];
    const release = (k: string) => !buttons[k] && this.padPrevious[k] && !!pad;

    const markerChord = practice && buttons.spinLeft && buttons.spinRight;
    const keyboardSteer = Number(heldAction('right')) - Number(heldAction('left'));
    const dpadSteer = markerChord ? 0 : Number(buttons.dpadRight) - Number(buttons.dpadLeft);
    const keyboardDrive = Number(heldAction('up')) - Number(heldAction('down'));
    const dpadDrive = markerChord ? 0 : Number(buttons.dpadUp) - Number(buttons.dpadDown);
    const rawStickX = pad?.axes?.[0] || 0;
    const rawStickY = -(pad?.axes?.[1] || 0);

    const taps = new Set<Direction>(this.taps.update(rawStickX, rawStickY));
    if (pressedAction('up') || (!markerChord && edge('dpadUp'))) taps.add('up');
    if (pressedAction('down') || (!markerChord && edge('dpadDown'))) taps.add('down');
    if (pressedAction('left') || (!markerChord && edge('dpadLeft'))) taps.add('left');
    if (pressedAction('right') || (!markerChord && edge('dpadRight'))) taps.add('right');

    const frame: InputFrame = {
      steer: keyboardSteer || dpadSteer || axis(rawStickX),
      drive: keyboardDrive || dpadDrive || axis(rawStickY),
      directionTaps: [...taps],
      brake: heldAction('brake') || buttons.brake,
      ollieHeld: heldAction('ollie') || buttons.ollie,
      olliePressed: (pressedAction('ollie') && !this.padPrevious.ollie) || (edge('ollie') && !heldAction('ollie')),
      ollieReleased: !heldAction('ollie') && !buttons.ollie && (releasedAction('ollie') || release('ollie')),
      flipPressed: pressedAction('flip') || edge('flip'),
      grabPressed: pressedAction('grab') || edge('grab'),
      grabHeld: heldAction('grab') || buttons.grab,
      grindPressed: pressedAction('grind') || edge('grind'),
      grindHeld: heldAction('grind') || buttons.grind,
      spin: (Number(heldAction('spinRight')) + Number(buttons.spinRight)) - (Number(heldAction('spinLeft')) + Number(buttons.spinLeft)),
      vertExit: heldAction('vertExit') || buttons.vertExit,
      switchStancePressed: pressedAction('switchStance') || edge('switchStance'),
      pausePressed: just('Escape') || edge('pause'),
      cameraModePressed: (pressedAction('cameraMode') && !held('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight')) || edge('cameraMode'),
      reset: pressedAction('reset') || edge('reset'),
      practiceMark: pressedAction('practiceMark') || edge('practiceMark') || (markerChord && edge('dpadUp')),
      practiceReturn: pressedAction('practiceReturn') || edge('practiceReturn') || (markerChord && edge('dpadDown')),
      cameraX: axis(pad?.axes[2]),
      cameraY: axis(pad?.axes[3]),
      mouseDX: this.mouseDX,
      mouseDY: this.mouseDY,
      cameraActive: this.pointerLook || Math.abs(axis(pad?.axes[2])) > 0 || Math.abs(axis(pad?.axes[3])) > 0,
    };

    this.padPrevious = buttons;
    this.mouseDX = 0; this.mouseDY = 0;
    this.pressed.clear(); this.released.clear();
    return frame;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('pointermove', this.onPointerMove);
  }
}
