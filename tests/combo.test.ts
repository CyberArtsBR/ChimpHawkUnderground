import { describe, expect, it } from 'vitest';
import { Combo, repeatFactor } from '../src/tricks/Combo';

describe('Combo scoring', () => {
  it('multiplies the base by the number of tricks', () => {
    const c = new Combo();
    c.add('Kickflip', 100);
    c.add('50-50', 150);
    c.addHeld(50);
    expect(c.base).toBe(300);
    expect(c.multiplier).toBe(2);
    expect(c.total).toBe(600);
    expect(c.label).toBe('Kickflip + 50-50');
  });

  it('pays less for repeats in the same line', () => {
    expect(repeatFactor(0)).toBe(1);
    expect(repeatFactor(1)).toBe(0.5);
    expect(repeatFactor(10)).toBe(0.1);
    const c = new Combo();
    c.add('Kickflip', 100); c.add('Kickflip', 100); c.add('Kickflip', 100);
    expect(c.entries.map(e => e.points)).toEqual([100, 50, 25]);
  });

  it('banks once and clears; a bail loses everything', () => {
    const c = new Combo();
    c.add('Ollie', 50);
    expect(c.bank()).toEqual({ points: 50, tricks: 1, multiplier: 1, label: 'Ollie' });
    expect(c.bank()).toBeNull();
    c.add('Heelflip', 120); c.fail();
    expect(c.active).toBe(false);
  });

  it('upgrades the last trick without adding to the multiplier', () => {
    const c = new Combo();
    c.add('Kickflip', 100);
    c.upgradeLast('Double Kickflip', 250);
    expect(c.multiplier).toBe(1);
    expect(c.label).toBe('Double Kickflip');
    expect(c.base).toBe(250);
  });
});
