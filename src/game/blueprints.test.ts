/* Level-time budget — the Airxonix-style clock per level (blueprints.ts).
   Pure function: generous early, tighter each level, floored at 35s. */
import '../test/browser-env';   // blueprints -> enemies -> dims/constants touch the DOM at import
import { describe, it, expect } from 'vitest';
import { levelTimeBudget } from './blueprints';

describe('levelTimeBudget(lv) = max(35, 70 - lv*1.5)', () => {
  it('tightens each level early on', () => {
    expect(levelTimeBudget(1)).toBe(68.5);
    expect(levelTimeBudget(10)).toBe(55);
    expect(levelTimeBudget(23)).toBe(35.5);
  });
  it('floors at 35s for deep levels', () => {
    expect(levelTimeBudget(24)).toBe(35);   // 34 -> floored
    expect(levelTimeBudget(40)).toBe(35);   // 10 -> floored
    expect(levelTimeBudget(99)).toBe(35);
  });
});
