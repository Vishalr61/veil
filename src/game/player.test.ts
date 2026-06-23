/* Fuse + level-timer death behavior (player.ts). The fuse is armed in arrive()
   when a draw starts, ticked in updatePlayer, and disarmed when the loop closes
   (doCapture clears hasTrail). timeoutDeath() is the level-clock-expired path.

   These assert the SPEC, not whatever the code happens to do. */
import { G, COLS, CELL, FILLED, resetG, freshPlayer, hasPopup, cellAt } from '../test/g-fixture';
import { describe, it, expect, beforeEach } from 'vitest';
import { updatePlayer, timeoutDeath, checkNearMiss } from './player';
import { doCapture } from './capture';

beforeEach(() => resetG());

describe('near-miss (while drawing, slip past an enemy that then recedes)', () => {
  it('rewards a receding in-band enemy once (debounced)', () => {
    G.hasTrail = true; G.player = freshPlayer(); G.player.px = { x: 200, y: 200 };
    const e: any = { x: 200 + CELL * 1.2, y: 200, type: 'drifter', nmPrevD: CELL * 1.0 };  // in-band, receding
    G.enemies = [e];
    const before = G.score;
    checkNearMiss(0.016);
    expect(G.score).toBeGreaterThan(before);
    expect(hasPopup('CLOSE')).toBe(true);
    // debounced — an immediate second pass doesn't double-reward
    const after = G.score; G.popups = []; e.x = 200 + CELL * 1.3;   // still receding/in-band
    checkNearMiss(0.016);
    expect(G.score).toBe(after);
  });
  it('does not fire when not drawing, or when the enemy is approaching', () => {
    G.player = freshPlayer(); G.player.px = { x: 200, y: 200 };
    G.hasTrail = false;                                                       // safe — not vulnerable
    G.enemies = [{ x: 200 + CELL * 1.2, y: 200, type: 'drifter', nmPrevD: CELL * 1.0 } as any];
    checkNearMiss(0.016);
    expect(hasPopup('CLOSE')).toBe(false);
    G.hasTrail = true;                                                        // drawing, but approaching (d < prev)
    G.enemies = [{ x: 200 + CELL * 1.2, y: 200, type: 'drifter', nmPrevD: CELL * 1.4 } as any];
    checkNearMiss(0.016);
    expect(hasPopup('CLOSE')).toBe(false);
  });
});

// Step the player from a FILLED safe cell onto the EMPTY cell to its right; the
// arrival starts a draw and arms the fuse. Returns after that single step.
function armDrawAtLevel(level: number) {
  G.level = level;
  const from = cellAt(8, 20);            // interior, away from borders
  G.grid[from] = FILLED;                 // safe ground to leave
  G.player = { from, to: from + 1, t: 0.95, dir: { x: 1, y: 0 }, stopped: false, px: { x: 0, y: 0 }, tail: [], invuln: 0 };
  G.buffered = null;
  updatePlayer(0.05);                    // crosses into the empty cell -> arrive() -> arm
}

describe('fuse: fuseMax = max(2.8, 6 - level*0.12)', () => {
  it('scales down with level', () => {
    armDrawAtLevel(1); expect(G.fuseMax).toBeCloseTo(5.88, 5);
    resetG(); armDrawAtLevel(10); expect(G.fuseMax).toBeCloseTo(4.8, 5);
    resetG(); armDrawAtLevel(26); expect(G.fuseMax).toBeCloseTo(2.88, 5);
  });
  it('floors at 2.8 for high levels (where 6 - level*0.12 < 2.8)', () => {
    resetG(); armDrawAtLevel(27); expect(G.fuseMax).toBeCloseTo(2.8, 5);   // 2.76 -> floored
    resetG(); armDrawAtLevel(40); expect(G.fuseMax).toBeCloseTo(2.8, 5);   // 1.2  -> floored
    resetG(); armDrawAtLevel(99); expect(G.fuseMax).toBeCloseTo(2.8, 5);
  });
});

describe('fuse: arming and disarming', () => {
  it('arms when a draw starts on an open cell (hasTrail set, fuseT zeroed)', () => {
    expect(G.hasTrail).toBe(false);
    armDrawAtLevel(5);
    expect(G.hasTrail).toBe(true);
    expect(G.fuseT).toBe(0);
    expect(G.fuseMax).toBeGreaterThan(0);
  });

  it('disarms when the loop closes (capture clears the trail)', () => {
    // armed, mid-burn
    G.hasTrail = true; G.fuseT = 2.0; G.fuseMax = 5;
    G.player.px = { x: 80, y: 80 };
    G.trailCells = [cellAt(5, 5), cellAt(6, 5)];
    doCapture();                                   // closing the loop
    expect(G.hasTrail).toBe(false);                // fuse disarmed

    // with no open line, the fuse must not tick or burn even over a long step
    G.player = freshPlayer(); G.player.px = { x: 50, y: 50 };
    updatePlayer(10);
    expect(G.lives).toBe(3);
  });
});

describe('fuse: death', () => {
  it('fires when fuseT reaches fuseMax (loses a life, BURNED popup)', () => {
    G.hasTrail = true; G.fuseMax = 3; G.fuseT = 2.99;
    G.player = freshPlayer(); G.player.px = { x: 50, y: 50 };
    updatePlayer(0.05);                            // 2.99 + 0.05 = 3.04 >= 3
    expect(G.lives).toBe(2);
    expect(hasPopup('BURNED')).toBe(true);
  });

  it('does NOT fire before fuseT reaches fuseMax', () => {
    G.hasTrail = true; G.fuseMax = 5; G.fuseT = 1.0;
    G.player = freshPlayer(); G.player.px = { x: 50, y: 50 };
    updatePlayer(0.5);                             // 1.0 + 0.5 = 1.5 < 5
    expect(G.lives).toBe(3);
    expect(G.fuseT).toBeCloseTo(1.5, 5);
  });
});

describe('level timer: timeoutDeath()', () => {
  it('resets the clock and costs a life, with a TIME! popup', () => {
    G.levelT = 45; G.lives = 3;
    G.player = freshPlayer(); G.player.px = { x: 50, y: 50 };
    timeoutDeath();
    expect(G.levelT).toBe(0);
    expect(G.lives).toBe(2);
    expect(hasPopup('TIME!')).toBe(true);
  });

  it('is a no-op when not playing (guarded)', () => {
    G.state = 'menu'; G.levelT = 45; G.lives = 3;
    G.player = freshPlayer();
    timeoutDeath();
    expect(G.levelT).toBe(45);
    expect(G.lives).toBe(3);
  });

  it('is a no-op while invulnerable (no double-death on respawn)', () => {
    G.levelT = 45; G.lives = 3;
    G.player = freshPlayer(); G.player.invuln = 1.5;
    timeoutDeath();
    expect(G.levelT).toBe(45);
    expect(G.lives).toBe(3);
  });
});
