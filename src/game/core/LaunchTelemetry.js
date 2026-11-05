/** Bounded simulation-owned release ledger. No rendering or trajectory authority. */
export class LaunchTelemetry {
  constructor() {
    this.time = 0;
    this.serial = 0;
    this.release = null;
    this.flight = null;
    this.lastFlight = null;
    this.history = [];
    this.pending = [];
  }

  emit(type, data = {}) {
    const event = { type, time: this.time, ...data };
    this.history.push(event);
    this.pending.push(event);
    if (this.history.length > 128) this.history.shift();
    if (this.pending.length > 128) this.pending.shift();
  }

  beginRelease(runtime) {
    this.release = { id: ++this.serial, time: this.time, charge: runtime.charge,
      grounded: !!runtime.grounded, position: runtime.position.toArray(),
      velocity: runtime.velocity.toArray(), owner: null, command: null };
    this.emit('release', { releaseId: this.release.id, charge: runtime.charge,
      position: [...this.release.position], velocity: [...this.release.velocity] });
  }

  resolve(command, details = {}) {
    if (!this.release) return;
    this.release.command = command;
    this.emit('interpret', { releaseId: this.release.id, command, ...details });
  }

  claim(owner) {
    if (!this.release || this.release.owner) return false;
    this.release.owner = owner;
    if (this.flight && owner === 'late-ramp') this.flight.lateReleaseId = this.release.id;
    this.emit('credit', { releaseId: this.release.id, owner, charge: this.release.charge });
    return true;
  }

  observe(runtime) {
    const airborne = !runtime.grounded && !runtime.grind && !runtime.wallRide && !runtime.bailTime;
    if (airborne && !this.flight) {
      this.flight = { departureTime: this.time, position: runtime.position.toArray(),
        velocity: runtime.velocity.toArray(), mode: runtime.movementState,
        normal: runtime.normal.toArray(), stance: runtime.stance,
        lipPoint: runtime.transitionAir?.frame?.lipPoint?.toArray?.() ?? null,
        transferring: !!runtime.transitionAir?.transferring,
        transitionId: runtime.transitionAir?.transitionId ?? null,
        requested: !!runtime.takeoffOllieRequested, peakY: runtime.position.y,
        releaseId: runtime.takeoffOllieRequested ? this.release?.id ?? null : null };
      this.emit('departure', { ...this.flight, position: [...this.flight.position], velocity: [...this.flight.velocity] });
    }
    if (!this.flight) return;
    this.flight.peakY = Math.max(this.flight.peakY, runtime.position.y);
    if (runtime.grounded || runtime.grind || runtime.wallRide || runtime.bailTime) {
      this.lastFlight = { ...this.flight, endTime: this.time,
        riseAboveDeparture: this.flight.peakY - this.flight.position[1],
        peakAboveCoping: this.flight.lipPoint ? this.flight.peakY - this.flight.lipPoint[1] : null,
        outcome: runtime.bailTime ? 'bail' : runtime.grind ? 'grind' : runtime.wallRide ? 'wall' : 'grounded',
        endPosition: runtime.position.toArray(), endVelocity: runtime.velocity.toArray() };
      this.emit('reentry', { ...this.lastFlight });
      this.flight = null;
    }
  }

  snapshot() {
    return JSON.parse(JSON.stringify({ units: { time: 'seconds', distance: 'metres', velocity: 'metres/second' },
      time: this.time, release: this.release, activeFlight: this.flight, lastFlight: this.lastFlight, history: this.history }));
  }

  drain() {
    const events = this.pending;
    this.pending = [];
    return JSON.parse(JSON.stringify(events));
  }
}
