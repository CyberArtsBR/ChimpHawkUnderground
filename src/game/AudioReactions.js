// Reactions only consume accepted scoring events; no delayed applause queue.
export const CROWD_BANDS = Object.freeze({ subdued: 400, medium: 1200, exceptional: 3000 });
export class AudioReactions {
  constructor() { this.seen = new Set(); this.lastCrowd = -Infinity; this.lastVoice = -Infinity; this.lastEffort = -Infinity; this.lastBand = 0; }
  combo({ id, points, personalBest = false, location } = {}, now) {
    if (id == null || this.seen.has(id) || !Number.isFinite(points) || points <= 0) return null;
    this.seen.add(id);
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value);
    // Empty ORBIT deliberately has no invisible stadium audience.
    if (String(location).toLowerCase().includes('orbit')) return null;
    const band = points >= CROWD_BANDS.exceptional ? 3 : points >= CROWD_BANDS.medium ? 2 : points >= CROWD_BANDS.subdued ? 1 : 0;
    if (!band || now - this.lastCrowd < 10) return null;
    // Repeated ordinary lines get quiet acknowledgment, not escalating applause.
    const exceptional = band === 3 || (personalBest && band >= 2);
    this.lastCrowd = now; this.lastBand = band;
    return { kind: exceptional ? 'crowdExceptional' : band === 2 ? 'crowdMedium' : 'crowdSubdued', exceptional, level: exceptional ? .5 : band === 2 ? .34 : .2 };
  }
  contact(speed, now) {
    if (!Number.isFinite(speed) || speed < 3 || now - this.lastVoice < 3) return false;
    this.lastVoice = now; return true;
  }
  effort(speed, now) {
    if (speed < 7 || now - this.lastEffort < 7 || now - this.lastVoice < 3) return false;
    this.lastEffort = now; return true;
  }
}

// Index selection always excludes the immediately preceding actual sample.
export function pickNonRepeating(bank, previous, random = Math.random) {
  if (!bank?.length) return null;
  const choices = bank.length > 1 ? bank.filter(sample => sample !== previous) : bank;
  return choices[Math.min(choices.length - 1, Math.floor(Math.max(0, random()) * choices.length))];
}
