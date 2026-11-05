import { RUN_SCORE_RULES } from './RunFinalScore.js';

export const SCORE_RECORDS_KEY = 'chimp-hawk.park-records.v2';
const finiteScore = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
const parkKey = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;

/** Small, versioned records only; visual pose clips remain in session memory. */
export class ScoreRecords {
  constructor(storage) {
    this.storage = storage;
    this.records = Object.create(null);
    try {
      this.storage ??= globalThis.localStorage;
      const data = JSON.parse(this.storage?.getItem(SCORE_RECORDS_KEY) || 'null');
      if (data?.schema === 2 && data.parks && typeof data.parks === 'object') {
        for (const [key, records] of Object.entries(data.parks)) {
          if (!parkKey(key) || !records || typeof records !== 'object') continue;
          this.records[key] = Object.create(null);
          for (const [version, record] of Object.entries(records)) {
            if (finiteScore(record?.score) === null) continue;
            this.records[key][version] = { score: finiteScore(record.score),
              bestCombo: finiteScore(record.bestCombo) || 0, date: String(record.date || '').slice(0, 40) };
          }
        }
      }
    } catch { /* Blocked/corrupt storage leaves this session fully playable. */ }
  }

  get(park, version = RUN_SCORE_RULES.version) {
    const record = this.records[parkKey(park)]?.[version];
    return record ? { ...record, ruleVersion: version } : null;
  }

  record(park, run, now = new Date()) {
    const key = parkKey(park);
    const version = run?.scoreBreakdown?.ruleVersion;
    const score = finiteScore(run?.finalScore);
    if (!key || score === null || run?.practice || version !== RUN_SCORE_RULES.version) return null;
    const previous = this.get(key, version);
    const isNewBest = score > (previous?.score ?? 0);
    const firstRun = previous === null;
    const delta = previous ? score - previous.score : null;
    const bucket = this.records[key] ||= Object.create(null);
    const combo = finiteScore(run?.bestCombo?.points) || 0;
    bucket[version] = {
      score: Math.max(score, previous?.score ?? 0),
      bestCombo: Math.max(combo, previous?.bestCombo ?? 0),
      date: (isNewBest || firstRun) ? now.toISOString() : previous.date,
    };
    try { this.storage?.setItem(SCORE_RECORDS_KEY, JSON.stringify({ schema: 2, parks: this.records })); }
    catch { /* Quota/private mode still retains the current session record. */ }
    return { ...bucket[version], ruleVersion: version, previousBest: previous?.score ?? null,
      delta, isNewBest, firstRun };
  }
}
