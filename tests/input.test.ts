import { describe, expect, it } from 'vitest';
import { CONTROL_ACTIONS, defaultBindings, readBindings, withBinding, BINDINGS_KEY } from '../src/input/bindings';
import { DirectionTapDetector } from '../src/input/Input';
import { directionKey } from '../src/tricks/catalog';

describe('Classic bindings', () => {
  it('match the v1 default table exactly', () => {
    // This table is the contract with veteran players. Do not edit it casually.
    const v1: Record<string, [string[], number | null]> = {
      up: [['KeyW'], 12], down: [['KeyS'], 13], left: [['KeyA'], 14], right: [['KeyD'], 15],
      ollie: [['Space'], 0], flip: [['ArrowLeft'], 2], grab: [['ArrowRight'], 1], grind: [['ArrowUp'], 3],
      spinLeft: [['KeyQ'], 4], spinRight: [['KeyE'], 5], brake: [['ShiftLeft', 'ShiftRight'], null],
      vertExit: [['ControlLeft'], 6], switchStance: [['ControlRight'], 7], cameraMode: [['KeyC'], 11],
      reset: [['KeyR'], null], practiceMark: [['KeyM'], null], practiceReturn: [['KeyN'], null],
    };
    const bindings = defaultBindings();
    expect(Object.keys(bindings).sort()).toEqual(Object.keys(v1).sort());
    for (const [id, [keys, pad]] of Object.entries(v1)) {
      expect(bindings[id as keyof typeof bindings]).toEqual({ keyboard: keys, gamepad: pad });
    }
    expect(CONTROL_ACTIONS).toHaveLength(17);
  });

  it('rejects conflicts and reserved inputs', () => {
    const b = defaultBindings();
    const clash = withBinding(b, 'flip', 'keyboard', 'Space');
    expect(clash.ok).toBe(false);
    expect(withBinding(b, 'flip', 'keyboard', 'Escape').ok).toBe(false);
    expect(withBinding(b, 'flip', 'gamepad', 9).ok).toBe(false);
    const ok = withBinding(b, 'flip', 'keyboard', 'KeyF');
    expect(ok.ok && ok.bindings.flip.keyboard).toEqual(['KeyF']);
  });

  it('falls back to defaults on corrupt saved data', () => {
    const storage = { getItem: (k: string) => (k === BINDINGS_KEY ? '{"version":1,"actions":{"up":{"keyboard":["Escape"],"gamepad":1}}}' : null) };
    expect(readBindings(storage)).toEqual(defaultBindings());
  });
});

describe('Direction taps', () => {
  it('fires once per flick and re-arms near centre (v1 thresholds)', () => {
    const taps = new DirectionTapDetector();
    expect(taps.update(0.7, 0)).toEqual(['right']);
    expect(taps.update(0.9, 0)).toEqual([]);
    expect(taps.update(0.2, 0)).toEqual([]);
    expect(taps.update(0, -0.8)).toEqual(['down']);
  });

  it('maps stick directions to trick directions', () => {
    expect(directionKey(0, 0)).toBe('none');
    expect(directionKey(-1, 1)).toBe('upLeft');
    expect(directionKey(1, -1)).toBe('downRight');
    expect(directionKey(0.2, 0.2)).toBe('none');
  });
});
