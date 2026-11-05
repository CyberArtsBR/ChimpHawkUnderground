import { DirectionTapDetector } from './DirectionTapDetector.js';
import { readBindings, saveBindings, cloneBindings, withBinding } from './ControlBindings.js';

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
export const STICK_DEAD_ZONES = Object.freeze([0.08, 0.16, 0.24]);

export class SkateInput {
  constructor(element = window) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.enabled = false;
    this.bindings = readBindings();
    this.blockedKeys = new Set();
    this.blockedButtons = new Set();
    let saved; try { saved = Number(localStorage.getItem('streetskate.stickDeadZone')); } catch {}
    this.stickDeadZone = STICK_DEAD_ZONES.includes(saved) ? saved : 0.16;
    this.padPrevious = {};
    this.padIdentity = null;
    this.analogTaps = new DirectionTapDetector({ activation: 0.65, neutral: 0.30 });
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLook = false;

    this._down = e => {
      if (!this.enabled || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      if (this.blockedKeys.has(e.code)) return;
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (e.ctrlKey && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR'].includes(e.code)) e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this._up = e => {
      this.blockedKeys.delete(e.code);
      if (this.enabled && PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (this.keys.has(e.code)) this.released.add(e.code);
      this.keys.delete(e.code);
    };
    this._blur = () => this.clear();
    this._pointerDown = e => {
      if (!this.enabled || e.button !== 0) return;
      this.pointerLook = true;
      this.element?.setPointerCapture?.(e.pointerId);
    };
    this._pointerUp = e => {
      if (e.type !== 'pointercancel' && e.button !== 0) return;
      this.pointerLook = false;
      if (this.element?.hasPointerCapture?.(e.pointerId)) this.element.releasePointerCapture(e.pointerId);
    };
    this._pointerMove = e => {
      if (!this.enabled || !this.pointerLook) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };

    window.addEventListener('keydown', this._down, { passive: false });
    window.addEventListener('keyup', this._up, { passive: false });
    window.addEventListener('blur', this._blur);
    this.element?.addEventListener?.('pointerdown', this._pointerDown);
    this.element?.addEventListener?.('pointerup', this._pointerUp);
    this.element?.addEventListener?.('pointercancel', this._pointerUp);
    this.element?.addEventListener?.('pointermove', this._pointerMove);
  }

  clear() {
    this.keys.clear(); this.pressed.clear(); this.released.clear();
    // Keep physical button edges: clearing on pause must not retrigger held Start.
    this.analogTaps.reset();
    this.mouseDX = 0; this.mouseDY = 0; this.pointerLook = false;
  }

  // A consumed menu/rebind press cannot become a gameplay charge on resume.
  suppressHeldInputs() {
    for(const key of this.keys)this.blockedKeys.add(key);
    const pad=[...(globalThis.navigator?.getGamepads?.()||[])].find(p=>p?.connected);
    pad?.buttons?.forEach((button,index)=>{if(button.pressed)this.blockedButtons.add(index);});
    this.clear();this.padIdentity=null;
  }

  bind(action, device, value) {
    const result = withBinding(this.bindings, action, device, value);
    if (result.ok) this.setBindings(result.bindings);
    return result;
  }

  setBindings(bindings) {
    this.suppressHeldInputs();
    this.bindings = bindings;
    saveBindings(bindings);
    this.clear();
    this.padIdentity = null;
  }

  resetBindings() { this.setBindings(cloneBindings()); }

  read({ practice = false } = {}) {
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected);
    // A reconnect (or switching pads) inherits the physical held state,
    // rather than fabricating a button-down edge on its first frame.
    const identity = pad ? String(pad.index) + ':' + String(pad.id) : null;
    const padChanged = identity !== this.padIdentity;
    this.padIdentity = identity;
    const dead = this.stickDeadZone;
    const axis = v => Math.abs(v || 0) < dead ? 0 : Math.sign(v) * (Math.abs(v) - dead) / (1-dead);
    const held = (...codes) => codes.some(code => this.keys.has(code));
    const just = (...codes) => codes.some(code => this.pressed.has(code));
    const heldAction = action => held(...this.bindings[action].keyboard);
    const pressedAction = action => just(...this.bindings[action].keyboard);
    const releasedAction = action => this.bindings[action].keyboard.some(code => this.released.has(code));
    for (const index of this.blockedButtons) if (!pad?.buttons[index]?.pressed) this.blockedButtons.delete(index);
    const padAction = action => {
      const index=this.bindings[action].gamepad;
      return index!==null && !this.blockedButtons.has(index) && !!pad?.buttons[index]?.pressed;
    };

    const buttons = {
      ollie: padAction('ollie'),
      grab: padAction('grab'),
      flip: padAction('flip'),
      grind: padAction('grind'),
      spinLeft: padAction('spinLeft'),
      spinRight: padAction('spinRight'),
      vertExit: padAction('vertExit'),
      switchStance: padAction('switchStance'),
      pause: !!pad?.buttons[9]?.pressed,
      cameraMode: padAction('cameraMode'),
      dpadUp: padAction('up'),
      dpadDown: padAction('down'),
      dpadLeft: padAction('left'),
      dpadRight: padAction('right'),
      brake: padAction('brake'), reset: padAction('reset'),
      practiceMark: padAction('practiceMark'), practiceReturn: padAction('practiceReturn'),
    };
    if (padChanged) this.padPrevious = { ...buttons };
    const edge = key => buttons[key] && !this.padPrevious[key];
    const release = key => !buttons[key] && this.padPrevious[key] && !!pad;

    const keyboardSteer = Number(heldAction('right')) - Number(heldAction('left'));
    const markerChord = practice && buttons.spinLeft && buttons.spinRight;
    const dpadSteer = markerChord ? 0 : Number(buttons.dpadRight) - Number(buttons.dpadLeft);
    const keyboardDrive = Number(heldAction('up')) - Number(heldAction('down'));
    const dpadDrive = markerChord ? 0 : Number(buttons.dpadUp) - Number(buttons.dpadDown);
    const rawStickX = pad?.axes?.[0] || 0;
    const rawStickY = -(pad?.axes?.[1] || 0);
    const steer = keyboardSteer || dpadSteer || axis(rawStickX);
    const drive = keyboardDrive || dpadDrive || axis(rawStickY);

    const directionTaps = new Set(this.analogTaps.update(rawStickX, rawStickY));
    if (pressedAction('up') || (!markerChord && edge('dpadUp'))) directionTaps.add('up');
    if (pressedAction('down') || (!markerChord && edge('dpadDown'))) directionTaps.add('down');
    if (pressedAction('left') || (!markerChord && edge('dpadLeft'))) directionTaps.add('left');
    if (pressedAction('right') || (!markerChord && edge('dpadRight'))) directionTaps.add('right');

    const state = {
      steer,
      drive,
      directionTaps: [...directionTaps],
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
      cameraModeIndex: just('Digit1','Numpad1') ? 0 : just('Digit2','Numpad2') ? 1 : just('Digit3','Numpad3') ? 2 : null,
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
    return state;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
    this.element?.removeEventListener?.('pointerdown', this._pointerDown);
    this.element?.removeEventListener?.('pointerup', this._pointerUp);
    this.element?.removeEventListener?.('pointercancel', this._pointerUp);
    this.element?.removeEventListener?.('pointermove', this._pointerMove);
  }
}
