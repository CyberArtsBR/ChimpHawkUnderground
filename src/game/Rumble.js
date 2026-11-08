/**
 * Controller rumble (2026-11): light on landings, medium on grinds (with a
 * faint hum while grinding), medium-plus on bails. Uses the Gamepad API's
 * dual-rumble actuator when the connected pad has one; silently does nothing
 * otherwise. Reads skater state only.
 */
export const RUMBLE = Object.freeze({
  landing: { duration: 90, weakMagnitude: .38, strongMagnitude: .12 },
  bigLanding: { duration: 140, weakMagnitude: .55, strongMagnitude: .28 },
  grind: { duration: 170, weakMagnitude: .45, strongMagnitude: .42 },
  grindHum: { duration: 120, weakMagnitude: .14, strongMagnitude: .06 },
  bail: { duration: 340, weakMagnitude: .7, strongMagnitude: .8 },
  handplant: { duration: 110, weakMagnitude: .42, strongMagnitude: .2 },
});

function activePad() {
  try {
    return [...(globalThis.navigator?.getGamepads?.() || [])].find(p => p?.connected && p.vibrationActuator) || null;
  } catch { return null; }
}

export class Rumble {
  constructor() {
    this.enabled = true;
    this.wasGrounded = true;
    this.wasGrinding = false;
    this.wasBailing = false;
    this.airTime = 0;
    this.humTimer = 0;
  }

  play(effect) {
    if (!this.enabled) return false;
    const pad = activePad();
    if (!pad) return false;
    try { pad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, ...effect })?.catch?.(() => {}); return true; }
    catch { return false; }
  }

  reset(skater = null) {
    this.wasGrounded = skater ? Boolean(skater.grounded) : true;
    this.wasGrinding = Boolean(skater?.grind);
    this.wasBailing = Number(skater?.bailTime) > 0;
    this.airTime = 0;
  }

  update(dt, skater, active = true) {
    if (!skater || !active) { this.reset(skater); return; }
    const grounded = Boolean(skater.grounded), grinding = Boolean(skater.grind), bailing = Number(skater.bailTime) > 0;
    if (bailing && !this.wasBailing) this.play(RUMBLE.bail);
    else if (!bailing) {
      if (skater.handplant && skater.handplant !== this.lastPlant) this.play(RUMBLE.handplant);
      if (grinding && !this.wasGrinding) { this.play(RUMBLE.grind); this.humTimer = .2; }
      else if (grinding) {
        this.humTimer -= dt;
        if (this.humTimer <= 0) { this.play(RUMBLE.grindHum); this.humTimer = .22; }
      }
      if (grounded && !this.wasGrounded && !grinding && this.airTime > .15)
        this.play(this.airTime > .8 ? RUMBLE.bigLanding : RUMBLE.landing);
    }
    this.airTime = grounded || grinding ? 0 : this.airTime + dt;
    this.wasGrounded = grounded; this.wasGrinding = grinding; this.wasBailing = bailing;
    this.lastPlant = skater.handplant || null;
  }
}
