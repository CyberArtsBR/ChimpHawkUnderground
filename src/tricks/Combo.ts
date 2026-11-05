// THUG-style combo scoring: every trick in a line adds base points, the line's
// multiplier is the number of tricks, and repeating a trick in the same line
// pays less each time. Landing clean banks it; bailing loses it.

export interface ComboEntry { name: string; points: number }

export interface BankResult { points: number; tricks: number; multiplier: number; label: string }

/** Each repeat of the same trick in one combo pays half the previous time (min 10%). */
export function repeatFactor(timesAlreadyUsed: number): number {
  return Math.max(0.1, 0.5 ** timesAlreadyUsed);
}

export class Combo {
  entries: ComboEntry[] = [];
  /** Points added continuously (grind/manual/grab hold time). */
  heldPoints = 0;
  private uses = new Map<string, number>();

  get active(): boolean { return this.entries.length > 0; }
  get base(): number { return Math.round(this.entries.reduce((sum, e) => sum + e.points, 0) + this.heldPoints); }
  get multiplier(): number { return Math.max(1, this.entries.length); }
  get total(): number { return this.base * this.multiplier; }
  get label(): string { return this.entries.map(e => e.name).join(' + '); }

  add(name: string, basePoints: number): ComboEntry {
    const used = this.uses.get(name) || 0;
    this.uses.set(name, used + 1);
    const entry = { name, points: Math.round(basePoints * repeatFactor(used)) };
    this.entries.push(entry);
    return entry;
  }

  /** Rename the latest entry (e.g. Kickflip upgraded to Double Kickflip) without adding a trick. */
  upgradeLast(name: string, basePoints: number): void {
    const last = this.entries[this.entries.length - 1];
    if (!last) return;
    const used = Math.max(0, (this.uses.get(name) || 0));
    this.uses.set(name, used + 1);
    last.name = name;
    last.points = Math.round(basePoints * repeatFactor(used));
  }

  addHeld(points: number): void { this.heldPoints += points; }

  bank(): BankResult | null {
    if (!this.active) return null;
    const result = { points: this.total, tricks: this.entries.length, multiplier: this.multiplier, label: this.label };
    this.clear();
    return result;
  }

  fail(): void { this.clear(); }

  clear(): void { this.entries = []; this.heldPoints = 0; this.uses.clear(); }
}
