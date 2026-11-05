// DOM HUD: score, speed, live combo string (THUG style, centred), balance
// meter, bank/bail callouts. Updated from game events; no per-frame layout work
// beyond a few text and transform writes.
import type { Skater, SkaterEvent } from '../skater/Skater';
import { CONTROL_ACTIONS, keyLabel, type Bindings } from '../input/bindings';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = '') => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
};

export class Hud {
  readonly root: HTMLElement;
  private score: HTMLElement;
  private speed: HTMLElement;
  private comboName: HTMLElement;
  private comboPoints: HTMLElement;
  private callout: HTMLElement;
  private balance: HTMLElement;
  private balanceNeedle: HTMLElement;
  private stateLabel: HTMLElement;
  private toast: HTMLElement;
  private calloutTimer = 0;
  private toastTimer = 0;
  private lastComboText = '';
  private shownScore = -1;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    const topLeft = el('div', 'hud-corner hud-tl', this.root);
    el('small', 'hud-label', topLeft, 'SCORE');
    this.score = el('div', 'hud-score', topLeft, '0');
    const bottomLeft = el('div', 'hud-corner hud-bl', this.root);
    this.speed = el('div', 'hud-speed', bottomLeft, '0');
    el('small', 'hud-label', bottomLeft, 'KM/H');
    this.stateLabel = el('div', 'hud-state', bottomLeft, 'RIDING');

    const combo = el('div', 'hud-combo', this.root);
    this.comboName = el('div', 'hud-combo-name', combo);
    this.comboPoints = el('div', 'hud-combo-points', combo);
    this.callout = el('div', 'hud-callout', this.root);
    this.balance = el('div', 'hud-balance', this.root);
    el('div', 'hud-balance-track', this.balance);
    this.balanceNeedle = el('div', 'hud-balance-needle', this.balance);
    this.toast = el('div', 'hud-toast', this.root);
    const help = el('div', 'hud-help', this.root);
    help.innerHTML = '<b>Esc</b> pause · <b>C</b> camera · <b>R</b> reset · <b>M</b>/<b>N</b> marker';
  }

  handle(event: SkaterEvent): void {
    if (event.type === 'bank') this.flash(`+${event.points.toLocaleString()}`, 'bank', event.multiplier > 1 ? `${event.label}  ×${event.multiplier}` : event.label);
    if (event.type === 'bail') this.flash('BAIL!', 'bail', event.lost > 0 ? `lost ${event.lost.toLocaleString()} · ${event.reason}` : event.reason);
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTimer = 1.6;
  }

  private flash(big: string, kind: string, small: string): void {
    this.callout.innerHTML = '';
    el('div', 'big', this.callout, big);
    el('div', 'small', this.callout, small);
    this.callout.className = `hud-callout show ${kind}`;
    this.calloutTimer = 1.8;
  }

  update(skater: Skater, dt: number): void {
    if (skater.score !== this.shownScore) { this.shownScore = skater.score; this.score.textContent = skater.score.toLocaleString(); }
    const kmh = Math.round((skater.state === 'air' ? skater.velocity.length() : skater.grind ? skater.grind.speed : skater.speed) * 3.6);
    this.speed.textContent = String(kmh);
    const label = skater.state === 'air' && skater.air?.wall ? 'WALLRIDE' : skater.state === 'air' && skater.air?.vertNormal ? 'VERT AIR' : skater.state.toUpperCase();
    this.stateLabel.textContent = (skater.switchStance ? 'SWITCH · ' : '') + (skater.fakie ? 'FAKIE · ' : '') + label;

    const combo = skater.combo;
    const text = combo.active ? combo.label : '';
    if (text !== this.lastComboText) { this.lastComboText = text; this.comboName.textContent = text; }
    this.comboPoints.textContent = combo.active ? `${combo.base.toLocaleString()} × ${combo.multiplier}` : '';

    const balance = skater.balance;
    this.balance.classList.toggle('show', balance !== null);
    if (balance !== null) {
      this.balanceNeedle.style.transform = `translateX(${Math.max(-1, Math.min(1, balance)) * 90}px)`;
      this.balance.classList.toggle('vertical', !!skater.manual);
    }

    if (this.calloutTimer > 0 && (this.calloutTimer -= dt) <= 0) this.callout.classList.remove('show');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toast.classList.remove('show');
  }
}

/** Controls table for the pause menu, built from the live bindings. */
export function controlsTable(bindings: Bindings): string {
  const rows = CONTROL_ACTIONS.map(a => {
    const keys = bindings[a.id].keyboard.map(keyLabel).join(' / ');
    const pad = bindings[a.id].gamepad;
    return `<tr><td>${a.label}</td><td>${keys}</td><td>${pad === null ? '—' : `Button ${pad}`}</td></tr>`;
  }).join('');
  return `<table class="controls"><thead><tr><th>Action</th><th>Keyboard</th><th>Gamepad</th></tr></thead><tbody>${rows}
    <tr><td>Manual / Nose manual</td><td>W then S / S then W</td><td>D-pad up→down / down→up</td></tr>
    <tr><td>Directional flip / grab / grind</td><td>Hold WASD + ← / → / ↑</td><td>Stick + X / B / Y</td></tr>
    <tr><td>Vert: carry over the coping</td><td>Left Ctrl after the apex</td><td>LT after the apex</td></tr>
  </tbody></table>`;
}
