import test from 'node:test';
import assert from 'node:assert/strict';
import { captureAuditTelemetry, formatAuditTelemetry } from '../src/game/DebugOverlay.js';

test('live overlay measures physical speed separately from HUD and reports a camera overhead risk', () => {
  const telemetry = captureAuditTelemetry({
    skater: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -10 },
      speed: 4, grounded: false, heading: 0, stance: -1, airTime: 0.4 },
    camera: { position: { x: 0, y: 9, z: 2 } },
    followCamera: { mode: 'follow', occlusionActive: true },
    focused: true, fps: 60,
  });
  assert.equal(telemetry.speedKmh, 36);
  assert.equal(telemetry.hudKmh, 14.4);
  assert.equal(telemetry.behindTravel, 1);
  assert.ok(telemetry.cameraPitchDeg > 66);
  assert.ok(telemetry.warnings.includes('CAMERA: overhead angle'));
  assert.match(formatAuditTelemetry(telemetry), /36 \/ 14.4 km\/h/);
});

test('QA overlay reveals browser focus suspension without reporting a physics crash', () => {
  const telemetry = captureAuditTelemetry({ paused: true, focused: false });
  assert.equal(telemetry.mode, 'PAUSED');
  assert.match(telemetry.warnings.join(' '), /UNFOCUSED/);
  assert.equal(telemetry.fps, null);
});

test('QA overlay exposes stalled grind and transition state without mutating it', () => {
  const grind = { rail: { name: 'Street flat rail', length: 8 }, s: 4, time: 1.5, speed: 0, balance: -0.1 };
  const skater = { grounded: false, grind, velocity: { x: 0, y: 0, z: 0 }, airTime: 2 };
  const telemetry = captureAuditTelemetry({ skater, focused: true });
  assert.equal(telemetry.railS, 4);
  assert.equal(telemetry.mode, 'GRIND');
  assert.equal(telemetry.warnings.length, 1);
  assert.equal(grind.speed, 0);
});
