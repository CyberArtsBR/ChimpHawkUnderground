/**
 * Local leaderboard (2026-11): the top 10 timed runs per map, kept in this
 * browser, with rider, deck, best combo and date. Practice runs never count.
 */
export const LEADERBOARD_KEY = 'chimp-hawk.leaderboard.v1';
export const LEADERBOARD_SIZE = 10;

const clean = (value, max = 40) => String(value ?? '').slice(0, max);
const score = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : null;

export class LocalLeaderboard {
  constructor(storage) {
    this.storage = storage ?? globalThis.localStorage;
    this.maps = Object.create(null);
    try {
      const data = JSON.parse(this.storage?.getItem(LEADERBOARD_KEY) || 'null');
      if (data?.schema === 1 && data.maps && typeof data.maps === 'object') {
        for (const [map, list] of Object.entries(data.maps)) {
          if (!Array.isArray(list)) continue;
          this.maps[map] = list.filter(e => score(e?.score) !== null).slice(0, LEADERBOARD_SIZE)
            .map(e => ({ score: score(e.score), rider: clean(e.rider), deck: clean(e.deck), combo: score(e.combo) || 0, date: clean(e.date) }));
        }
      }
    } catch { /* blocked or corrupt storage: start empty */ }
  }

  list(map) { return (this.maps[map] || []).map(e => ({ ...e })); }

  /** Add a finished run; returns { entries, rank } (rank is 1-based, or null if it did not place). */
  record(map, run, now = new Date()) {
    const value = score(run?.finalScore);
    if (!map || value === null || run?.practice) return { entries: this.list(map), rank: null };
    const entry = { score: value, rider: clean(run.riderName), deck: clean(run.deckName),
      combo: score(run?.bestCombo?.points) || 0, date: now.toISOString(), current: true };
    const list = [...(this.maps[map] || []), entry].sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE);
    const index = list.indexOf(entry);
    this.maps[map] = list.map(({ current, ...rest }) => rest);
    try { this.storage?.setItem(LEADERBOARD_KEY, JSON.stringify({ schema: 1, maps: this.maps })); } catch { /* keep in memory */ }
    return { entries: list.map(e => ({ ...e })), rank: index >= 0 ? index + 1 : null };
  }
}
