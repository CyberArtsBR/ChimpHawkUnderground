// Session Run timing, ported from v1 SessionFlow: 90 seconds, a short ready
// beat, then up to 6 seconds of overtime to land a combo that is still going
// when the clock hits zero. Pure logic: no DOM, no wall clock.

export const SESSION_POLICY = { duration: 90, readySeconds: 1.15, overtimeSeconds: 6 } as const;

export type SessionPhase = 'ready' | 'playing' | 'overtime' | 'finished';
export type FinishReason = 'clock' | 'bail' | 'landed' | 'grace-expired' | 'attempt-ended' | null;
export type SessionEvent = 'go' | 'ten' | 'five' | 'overtime' | 'finish';

export interface AttemptState { comboActive: boolean; bailed: boolean; eligibleAttempt: boolean }

export class Session {
  phase: SessionPhase = 'ready';
  practice = false;
  remaining: number = SESSION_POLICY.duration;
  readyRemaining: number = SESSION_POLICY.readySeconds;
  overtimeRemaining: number = SESSION_POLICY.overtimeSeconds;
  elapsed = 0;
  finishReason: FinishReason = null;
  private settled = false;
  private events: SessionEvent[] = [];
  private warned = { ten: false, five: false };

  constructor(private policy: { duration: number; readySeconds: number; overtimeSeconds: number } = SESSION_POLICY) {
    this.begin();
  }

  begin({ practice = false } = {}): void {
    this.practice = practice;
    this.phase = practice ? 'playing' : 'ready';
    this.remaining = this.policy.duration;
    this.readyRemaining = practice ? 0 : this.policy.readySeconds;
    this.overtimeRemaining = this.policy.overtimeSeconds;
    this.elapsed = 0;
    this.finishReason = null;
    this.settled = false;
    this.events = [];
    this.warned = { ten: false, five: false };
  }

  /** The skater may move during play and overtime only. */
  get allowSimulation(): boolean { return this.phase === 'playing' || this.phase === 'overtime'; }

  /** Call when a combo banks. During overtime it ends the run on a high note. */
  acceptSettlement(): void { if (this.phase === 'overtime') this.settled = true; }

  finish(reason: Exclude<FinishReason, null>): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.finishReason = reason;
    this.events.push('finish');
  }

  update(dt: number, attempt: AttemptState): SessionEvent[] {
    const step = Math.max(0, dt);
    if (this.phase === 'ready') {
      this.readyRemaining = Math.max(0, this.readyRemaining - step);
      if (this.readyRemaining === 0) { this.phase = 'playing'; this.events.push('go'); }
    } else if (this.phase === 'playing') {
      if (this.practice) this.elapsed += step;
      else {
        const overflow = Math.max(0, step - this.remaining);
        this.elapsed += Math.min(this.remaining, step);
        this.remaining = Math.max(0, this.remaining - step);
        if (!this.warned.ten && this.remaining <= 10) { this.warned.ten = true; this.events.push('ten'); }
        if (!this.warned.five && this.remaining <= 5) { this.warned.five = true; this.events.push('five'); }
        if (this.remaining === 0) {
          if (!attempt.bailed && (attempt.eligibleAttempt || attempt.comboActive)) {
            this.phase = 'overtime';
            this.overtimeRemaining = Math.max(0, this.policy.overtimeSeconds - overflow);
            this.events.push('overtime');
            if (this.overtimeRemaining === 0) this.finish('grace-expired');
          } else this.finish(attempt.bailed ? 'bail' : 'clock');
        }
      }
    } else if (this.phase === 'overtime') {
      if (attempt.bailed) this.finish('bail');
      else if (this.settled) this.finish('landed');
      else {
        this.overtimeRemaining = Math.max(0, this.overtimeRemaining - step);
        this.elapsed += step;
        if (this.overtimeRemaining === 0) this.finish('grace-expired');
        else if (!attempt.comboActive && !attempt.eligibleAttempt) this.finish('attempt-ended');
      }
    }
    return this.events.splice(0);
  }
}

/** Per-map best scores in localStorage. Blocked storage keeps the game playable. */
export class ScoreRecords {
  private key = 'chimphawk.records.v1';
  private records: Record<string, { score: number; bestCombo: number; date: string }> = {};

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = globalThis.localStorage ?? null) {
    try {
      const data = JSON.parse(storage?.getItem(this.key) || '{}');
      if (data && typeof data === 'object') this.records = data;
    } catch { /* ignore */ }
  }

  best(map: string): { score: number; bestCombo: number; date: string } | null { return this.records[map] ?? null; }

  /** Returns true when this run is a new personal best on the map. */
  record(map: string, score: number, bestCombo: number, date = new Date()): boolean {
    const previous = this.records[map];
    const isBest = !previous || score > previous.score;
    if (isBest) this.records[map] = { score, bestCombo: Math.max(bestCombo, previous?.bestCombo ?? 0), date: date.toISOString().slice(0, 10) };
    else if (bestCombo > previous.bestCombo) previous.bestCombo = bestCombo;
    try { this.storage?.setItem(this.key, JSON.stringify(this.records)); } catch { /* ignore */ }
    return isBest;
  }
}

/** Running stats for the results screen. */
export class RunStats {
  bestCombo = { points: 0, label: '' };
  banked = 0;
  bails = 0;
  tricks = 0;
  longestGrind = 0;
  biggestAir = 0;

  reset(): void { Object.assign(this, new RunStats()); }
}
