import { GRIND_TRICKS, DOUBLE_GRIND_TRICKS } from './TrickCatalog.js';

const grindNames = new Set([...Object.values(GRIND_TRICKS), ...Object.values(DOUBLE_GRIND_TRICKS)].map(trick => trick.name));
const has = (entries, name) => entries.some(entry => entry.name === name);
export const PRACTICE_DRILLS = Object.freeze([
  { id:'ollie', title:'Land an ollie', matches: entries => has(entries, 'Ollie') },
  { id:'kickflip', title:'Land a kickflip', matches: entries => has(entries, 'Kickflip') },
  { id:'grind', title:'Land a grind', matches: entries => entries.some(entry => grindNames.has(entry.name)) },
  { id:'combo', title:'Land a three-trick combo', matches: entries => entries.length >= 3 },
  { id:'low-pop', title:'Land a low pop · tap and release', matches: (entries, evidence) => has(entries, 'Ollie') && evidence?.popHeight > .2 && evidence.popHeight < 1.02 },
  { id:'high-pop', title:'Land a high pop · charge fully', matches: (entries, evidence) => has(entries, 'Ollie') && evidence?.popHeight >= 1.2 },
  { id:'switch', title:'Land a trick in switch', matches: entries => entries.some(entry => entry.stance < 0) },
  { id:'balance', title:'Correct rail balance, then land', matches: (entries, evidence) => evidence?.correctedBalance && entries.some(entry => grindNames.has(entry.name)) },
  { id:'ramp-return', title:'Launch and return into a ramp', matches: (_entries, evidence) => evidence?.rampReturn },
].map(Object.freeze));

/** Practice only: success requires the existing scorer's accepted landing. */
export class PracticeDrills {
  constructor() {
    this.enabled = false;
    this.target = null;
    this.index = 0;
    this.reset();
  }
  reset() {
    this.index = 0;
    this.completed = false;
    this.hint = '';
    this.retry();
  }
  retry() {
    this._previous = null;
    this._attempt = null;
    this._evidence = {};
    this._balancePeak = 0;
    this._balanceCorrected = false;
    this.hint = '';
  }
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) { this.target = null; this.reset(); }
    return this.enabled;
  }
  selectTrick(name, id = '') {
    if (typeof name !== 'string' || !name.trim()) return false;
    this.target = { name: name.trim(), id: String(id) };
    this.enabled = true;
    this.reset();
    return true;
  }
  selectDrill(id) {
    const index = PRACTICE_DRILLS.findIndex(drill => drill.id === id);
    if (index < 0) return false;
    this.target = null;
    this.enabled = true;
    this.reset();
    this.index = index;
    return true;
  }
  get label() {
    if (!this.enabled) return '';
    const instruction = this.target
      ? this.completed ? `${this.target.name} landed!` : `Land ${this.target.name}`
      : this.index >= PRACTICE_DRILLS.length ? 'All drills complete!'
      : `${this.index + 1} / ${PRACTICE_DRILLS.length} · ${PRACTICE_DRILLS[this.index].title}`;
    return this.hint ? `${instruction} · ${this.hint}` : instruction;
  }

  /** Observe real simulation transitions; UI selection or input alone is never success. */
  observe(skater, dt) {
    if (!this.enabled || !skater || !(dt > 0) || !Number.isFinite(dt)) return;
    const current = {
      grounded: Boolean(skater.grounded), grinding: Boolean(skater.grind),
      bailed: Number(skater.bailTime) > 0 || skater.movementState === 'BAIL',
      y: Number(skater.position?.y) || 0, normalY: skater.normal?.y ?? 1,
      serial: skater.respawnSerial || 0,
    };
    const previous = this._previous;
    if (previous && current.serial !== previous.serial) this.retry();
    if (current.bailed && !previous?.bailed) {
      this.hint = skater.flipState && skater.flipState.progress < .9
        ? 'Pop higher so the board can finish its rotation.'
        : 'Release the direction and align the board before landing.';
      this._attempt = null;
      this._evidence = {};
      this._balanceCorrected = false;
      this._balancePeak = 0;
    } else if (!current.bailed) {
      const airborne = !current.grounded && !current.grinding && !skater.wallRide;
      if (airborne && (!this._attempt || previous?.grounded || previous?.grinding)) {
        this._attempt = { y: previous?.y ?? current.y, peak: current.y,
          fromRamp: Boolean(skater.transitionAir) || (previous?.normalY ?? 1) < .95 };
      }
      if (this._attempt) {
        this._attempt.peak = Math.max(this._attempt.peak, current.y);
        this._attempt.fromRamp ||= Boolean(skater.transitionAir);
        if (current.grounded && previous && !previous.grounded) {
          this._evidence = { ...this._evidence,
            popHeight: Math.max(0, this._attempt.peak - this._attempt.y),
            rampReturn: this._attempt.fromRamp && current.normalY < .98,
          };
          this._attempt = null;
        }
      }
      if (current.grinding) {
        const balance = Math.abs(Number(skater.grindBalance) || 0);
        if (!previous?.grinding) this._balancePeak = balance;
        this._balancePeak = Math.max(this._balancePeak, balance);
        if (this._balancePeak >= .45 && balance < .2) this._balanceCorrected = true;
        this._evidence.correctedBalance = this._balanceCorrected;
      }
    }
    this._previous = current;
  }

  accept(entries) {
    if (!this.enabled || !Array.isArray(entries) || !entries.length) return false;
    let success = false;
    if (this.target) {
      if (this.completed) return false;
      success = has(entries, this.target.name);
      if (success) this.completed = true;
      else if (/^(Double |360 |Laser)/.test(this.target.name)
        && entries.some(entry => /flip|shove/i.test(entry.name))) {
        this.hint = 'Tap flip twice early, before the board reaches its catch.';
      } else this.hint = has(entries, 'Ollie')
        ? 'Tap the flip and direction just after releasing the ollie.'
        : 'Check the chosen direction, then release it after the flip tap.';
    } else if (this.index < PRACTICE_DRILLS.length) {
      success = Boolean(PRACTICE_DRILLS[this.index].matches(entries, this._evidence));
      if (success) this.index++;
    }
    this._evidence = {};
    this._balancePeak = 0;
    this._balanceCorrected = false;
    if (success) this.hint = '';
    return success;
  }
}
