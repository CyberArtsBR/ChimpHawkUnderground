import { describe, expect, it } from 'vitest';
import { ScoreRecords, Session } from '../src/game/Session';

const idle = { comboActive: false, bailed: false, eligibleAttempt: false };
const inCombo = { comboActive: true, bailed: false, eligibleAttempt: true };
const run = (s: Session, seconds: number, attempt = idle) => {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 0.1) events.push(...s.update(0.1, attempt));
  return events;
};

describe('Session Run (v1 rules)', () => {
  it('ready → go → 90 s → time, with 10 s and 5 s warnings', () => {
    const s = new Session();
    expect(s.phase).toBe('ready');
    expect(s.allowSimulation).toBe(false);
    const events = run(s, 92);
    expect(events).toEqual(['go', 'ten', 'five', 'finish']);
    expect(s.finishReason).toBe('clock');
  });

  it('gives overtime to finish a combo, and ends when it lands', () => {
    const s = new Session();
    run(s, 1.2);
    run(s, 89.5);
    const events = run(s, 0.5, inCombo);
    expect(events).toContain('overtime');
    expect(s.phase).toBe('overtime');
    s.acceptSettlement();
    run(s, 0.1, inCombo);
    expect(s.phase).toBe('finished');
    expect(s.finishReason).toBe('landed');
  });

  it('a bail in overtime ends the run; overtime cannot exceed 6 s', () => {
    const a = new Session(); run(a, 1.2); run(a, 90.1, inCombo);
    run(a, 0.1, { comboActive: false, bailed: true, eligibleAttempt: false });
    expect(a.finishReason).toBe('bail');
    const b = new Session(); run(b, 1.2); run(b, 90.1, inCombo); run(b, 7, inCombo);
    expect(b.finishReason).toBe('grace-expired');
  });

  it('free skate has no clock', () => {
    const s = new Session();
    s.begin({ practice: true });
    expect(s.allowSimulation).toBe(true);
    expect(run(s, 200)).toEqual([]);
  });
});

describe('score records', () => {
  it('keeps the best score per map', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const r = new ScoreRecords(storage);
    expect(r.record('paradise', 1000, 400)).toBe(true);
    expect(r.record('paradise', 800, 600)).toBe(false);
    expect(r.best('paradise')).toMatchObject({ score: 1000, bestCombo: 600 });
    expect(new ScoreRecords(storage).best('paradise')?.score).toBe(1000);
  });
});
