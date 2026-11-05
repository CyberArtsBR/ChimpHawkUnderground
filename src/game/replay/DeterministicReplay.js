import { PHYSICS } from '../StreetPhysics.js';
import {
  captureGameplayState,
  gameplayStateFiniteErrors,
  gameplayStateSignature,
} from '../core/GameplayStateSnapshot.js';

const EDGE_INPUTS = Object.freeze([
  'olliePressed',
  'ollieReleased',
  'grindPressed',
  'pausePressed',
  'reset',
]);

function copyInput(input = {}) {
  return { ...input };
}

/**
 * Author one deterministic replay segment. `frames` are fixed simulation frames,
 * not render frames. Edge-triggered inputs are automatically emitted only on the
 * first frame of a multi-frame segment so a held segment cannot accidentally
 * press/release the same button 60 times.
 */
export function replaySegment(frames, input = {}) {
  return {
    frames: Math.max(1, Math.floor(Number(frames) || 1)),
    input: copyInput(input),
  };
}

export function expandReplayTape(segments = []) {
  const frames = [];
  for (const raw of segments) {
    const segment = raw?.input ? raw : replaySegment(raw?.frames ?? 1, raw ?? {});
    const count = Math.max(1, Math.floor(Number(segment.frames) || 1));
    for (let i = 0; i < count; i++) {
      const input = copyInput(segment.input);
      if (i > 0) {
        for (const key of EDGE_INPUTS) input[key] = false;
      }
      frames.push(input);
    }
  }
  return frames;
}

/**
 * Run gameplay at the authoritative 120 Hz simulation cadence and capture a
 * JSON-safe state snapshot after every fixed frame. This intentionally bypasses
 * variable render deltas: replay correctness is about deterministic gameplay,
 * while separate tests can group these same frames into different render rates.
 */
export function runDeterministicReplay({
  controller,
  segments = [],
  frames = null,
  step = PHYSICS.step,
  captureEvery = 1,
  throwOnNonFinite = true,
} = {}) {
  if (!controller || typeof controller.advance !== 'function') {
    throw new TypeError('runDeterministicReplay requires a gameplay controller with advance(delta, input)');
  }

  const tape = frames ? frames.map(copyInput) : expandReplayTape(segments);
  const snapshots = [];
  const stride = Math.max(1, Math.floor(Number(captureEvery) || 1));

  for (let frame = 0; frame < tape.length; frame++) {
    controller.advance(step, tape[frame]);
    if ((frame + 1) % stride !== 0 && frame !== tape.length - 1) continue;

    const state = captureGameplayState(controller);
    const errors = gameplayStateFiniteErrors(state);
    if (throwOnNonFinite && errors.length) {
      throw new Error(`Replay frame ${frame + 1} contains non-finite gameplay state: ${errors.join(', ')}`);
    }
    snapshots.push({ frame: frame + 1, state });
  }

  const final = snapshots.at(-1)?.state ?? captureGameplayState(controller);
  return {
    step,
    frameCount: tape.length,
    snapshots,
    final,
    signature: gameplayStateSignature(final),
  };
}

export function firstReplayDivergence(left, right) {
  const a = left?.snapshots || [];
  const b = right?.snapshots || [];
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const leftFrame = a[i] || null;
    const rightFrame = b[i] || null;
    if (JSON.stringify(leftFrame) !== JSON.stringify(rightFrame)) {
      return {
        index: i,
        left: leftFrame,
        right: rightFrame,
      };
    }
  }
  return null;
}
