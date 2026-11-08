import { calculateRunFinalScore } from './RunFinalScore.js';

const positive = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const rounded = value => Math.round(positive(value) * 100) / 100;

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/** Observes the existing simulation and accepted score banks; never changes gameplay. */
export class RunSummary {
  constructor() { this.begin(); }

  begin(metadata = {}, skater = null) {
    this.metadata = {
      riderName: String(metadata.riderName || ''),
      deckName: String(metadata.deckName || ''),
      mapName: String(metadata.mapName || ''),
      practice: Boolean(metadata.practice),
    };
    this.active = true;
    this.elapsedSeconds = 0;
    this.totalScore = 0;
    this.landedCombos = 0;
    this.tricksLanded = 0;
    this.bails = 0;
    this.topSpeedKmh = 0;
    this.distanceMeters = 0;
    this.grindDistanceMeters = 0;
    this.manualSeconds = 0;
    this.longestManualSeconds = 0;
    this.airTime = 0;
    this.maxAirTime = 0;
    this._airStreak = 0;
    this._manualStreak = 0;
    this._wasBailing = Boolean(skater?.bailTime > 0);
    this._wasGrinding = Boolean(skater?.grind);
    this._previousDistance = Number.isFinite(skater?.distance) ? skater.distance : null;
    this._previousX = skater?.position?.x;
    this._previousY = skater?.position?.y;
    this._previousZ = skater?.position?.z;
    this._respawnSerial = skater?.respawnSerial || 0;
    this._uniqueTricks = new Set();
    this.bestCombo = null;
    this._topTricks = [];
    this._topMoments = [];
    this._momentSerial = 0;
    this._finished = null;
    return this;
  }

  update(skater, dt) {
    if (!this.active || !skater || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsedSeconds += dt;
    const bailing = Number(skater.bailTime) > 0 || skater.movementState === 'BAIL';
    if (bailing && !this._wasBailing) this.bails++;
    const speed = Math.abs(Number.isFinite(skater.speed) ? skater.speed : 0);
    if (!bailing) this.topSpeedKmh = Math.max(this.topSpeedKmh, speed * 3.6);
    const respawnSerial = skater.respawnSerial || 0;
    const respawned = respawnSerial !== this._respawnSerial;
    let distance = 0;
    // Physics already measures the travelled path and excludes its respawn jump.
    // A reset may reduce that counter; it starts a new segment, never a negative trip.
    if (Number.isFinite(skater.distance)) {
      if (this._previousDistance !== null) distance = skater.distance - this._previousDistance;
      this._previousDistance = skater.distance;
    } else if (Number.isFinite(skater.position?.x) && Number.isFinite(this._previousX)) {
      distance = Math.hypot(skater.position.x - this._previousX,
        skater.position.y - this._previousY, skater.position.z - this._previousZ);
    }
    // Teleports, recovery and invalid positions are not skating achievements.
    if (!bailing && !this._wasBailing && !respawned && Number.isFinite(distance)
      && distance >= 0 && distance <= Math.max(1, speed * dt * 3 + 0.5)) {
      this.distanceMeters += distance;
      if (skater.grind || this._wasGrinding) this.grindDistanceMeters += distance;
    }
    this._previousX = skater.position?.x;
    this._previousY = skater.position?.y;
    this._previousZ = skater.position?.z;
    const airborne = !bailing && !skater.grounded && !skater.grind && !skater.wallRide;
    this._airStreak = airborne ? this._airStreak + dt : 0;
    if (airborne) this.airTime += dt;
    this.maxAirTime = Math.max(this.maxAirTime, this._airStreak);
    const manual = !bailing && Boolean(skater.manual) && Boolean(skater.grounded);
    this._manualStreak = manual ? this._manualStreak + dt : 0;
    if (manual) this.manualSeconds += dt;
    this.longestManualSeconds = Math.max(this.longestManualSeconds, this._manualStreak);
    this._wasBailing = bailing;
    this._wasGrinding = Boolean(skater.grind);
    this._respawnSerial = respawnSerial;
  }

  /** Call only when SkateTricks.settle() accepted the combo, using its pre-settle entries. */
  recordCombo(result) {
    if (!this.active || !result || !Number.isFinite(result.points) || result.points <= 0) return null;
    const points = Math.round(result.points);
    const entries = Array.isArray(result.entries) ? result.entries.filter(entry => entry?.name) : [];
    const label = String(result.names || entries.slice(-4).map(entry => entry.name).join(' + ') || 'Landed combo');
    const multiplier = Math.max(1, Math.min(12, Math.round(positive(result.multiplier) || 1)));
    this.totalScore += points;
    this.landedCombos++;
    this.tricksLanded += entries.length;
    for (const entry of entries) {
      const trickLabel = `${entry.stance < 0 ? 'Switch ' : ''}${entry.name}`;
      this._uniqueTricks.add(trickLabel);
      // The scorer's points already include its repeated-trick penalty. Duration
      // remains unweighted on the entry, so apply that same factor once here.
      const contribution = Math.floor((positive(entry.points ?? entry.basePoints)
        + positive(entry.durationPoints) * positive(entry.repeatFactor ?? 1)) * multiplier);
      if (contribution > 0) this._topTricks.push({ label: trickLabel, points: contribution, multiplier });
    }
    this._topTricks.sort((a, b) => b.points - a.points);
    this._topTricks.length = Math.min(3, this._topTricks.length);
    const combo = { points, label, trickCount: entries.length, multiplier };
    if (!this.bestCombo || points > this.bestCombo.points) this.bestCombo = combo;
    const endTime = Number.isFinite(result.endTime) ? positive(result.endTime) : this.elapsedSeconds;
    const startTime = Number.isFinite(result.startTime) ? Math.min(endTime, positive(result.startTime))
      : Math.max(0, endTime - positive(result.durationSeconds));
    const moment = freezeDeep({ id: ++this._momentSerial, ...combo, startTime, endTime });
    this._topMoments.push(moment);
    this._topMoments.sort((a, b) => b.points - a.points || a.id - b.id);
    this._topMoments.length = Math.min(3, this._topMoments.length);
    return moment;
  }

  finish({ totalScore, durationSeconds } = {}) {
    if (this._finished) return this._finished;
    this.active = false;
    const score = Number.isFinite(totalScore) ? Math.round(positive(totalScore)) : this.totalScore;
    const uniqueTricks = [...this._uniqueTricks];
    const scoreBreakdown = calculateRunFinalScore({ bankedScore: score,
      landedCombos: this.landedCombos, tricksLanded: this.tricksLanded,
      uniqueTricks, bails: this.bails });
    const achievements = [];
    if (this.bestCombo) achievements.push({ title: 'Best combo', detail: `${this.bestCombo.points.toLocaleString('en-US')} points · ${this.bestCombo.trickCount} ${this.bestCombo.trickCount===1?'trick':'tricks'}`, kind: 'combo' });
    if (this._uniqueTricks.size > 1) achievements.push({ title: 'Trick variety', detail: `${this._uniqueTricks.size} different landed tricks`, kind: 'variety' });
    if (this.maxAirTime >= 0.25) achievements.push({ title: 'Longest air', detail: `${this.maxAirTime.toFixed(2)} seconds airborne`, kind: 'air' });
    if (this.landedCombos && !this.bails) achievements.push({ title: 'Clean run', detail: `${this.landedCombos} ${this.landedCombos === 1 ? 'combo' : 'combos'} landed without a bail`, kind: 'clean' });
    if (this.grindDistanceMeters >= 1) achievements.push({ title: 'Rail distance', detail: `${this.grindDistanceMeters.toFixed(1)} metres grinding`, kind: 'grind' });
    if (this.longestManualSeconds >= 0.5) achievements.push({ title: 'Longest manual', detail: `${this.longestManualSeconds.toFixed(2)} seconds balanced`, kind: 'manual' });
    this._finished = freezeDeep({
      ...this.metadata, totalScore: score,
      finalScore: scoreBreakdown.finalScore, scoreBreakdown,
      durationSeconds: rounded(Number.isFinite(durationSeconds) ? durationSeconds : this.elapsedSeconds),
      bestCombo: this.bestCombo ? { ...this.bestCombo } : null,
      landedCombos: this.landedCombos, tricksLanded: this.tricksLanded, bails: this.bails,
      uniqueTricks,
      topSpeedKmh: rounded(this.topSpeedKmh), distanceMeters: rounded(this.distanceMeters),
      grindDistanceMeters: rounded(this.grindDistanceMeters), manualSeconds: rounded(this.manualSeconds),
      longestManualSeconds: rounded(this.longestManualSeconds),
      airTime: rounded(this.airTime), maxAirTime: rounded(this.maxAirTime),
      achievements, runTopTricks: this._topTricks.map(trick => ({ ...trick })),
      highlights: [...this._topMoments],
    });
    return this._finished;
  }
}
