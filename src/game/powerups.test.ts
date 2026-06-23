/* Power-up effects: SCAN (reveal the veil board-wide) and TIME (+clock). Both
   are applied when the player walks over a pickup (updatePickups -> applyPickup).
   SCAN's effect is setting G.scanT (which drives the board-wide reveal in
   render); TIME rewinds the level clock by 9s, clamped at 0. */
import { G, CELL, EMPTY, resetG, cellAt } from '../test/g-fixture';
import { describe, it, expect, beforeEach } from 'vitest';
import { updatePickups } from './powerups';

beforeEach(() => resetG());

// Drop a pickup right on the player so the collision in updatePickups applies it.
function dropOnPlayer(type: string) {
  const col = 5, row = 5, cell = cellAt(col, row);
  G.grid[cell] = EMPTY;                                 // must stay open or it's culled
  G.player.px = { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
  G.pickups = [{ x: G.player.px.x, y: G.player.px.y, cell, type, col: '#fff', life: 13, max: 13, bob: 0 }];
}

describe('BOMB (promoted to a general power-up)', () => {
  it('clears nearby enemies and is consumed', () => {
    dropOnPlayer('bomb');
    G.enemies = [
      { x: G.player.px.x + CELL, y: G.player.px.y, type: 'drifter' },       // within the blast radius
      { x: G.player.px.x + CELL * 20, y: G.player.px.y, type: 'drifter' },  // far away — survives
    ];
    updatePickups(0.016);
    expect(G.enemies.length).toBe(1);
    expect(G.pickups.length).toBe(0);
  });
});

describe('TIME', () => {
  it('rewinds the level clock by 9 seconds', () => {
    dropOnPlayer('time');
    G.levelT = 20;
    updatePickups(0.016);
    expect(G.levelT).toBe(11);
    expect(G.pickups.length).toBe(0);
  });

  it('clamps the clock at 0 (never negative)', () => {
    dropOnPlayer('time');
    G.levelT = 5;                                        // less than the 9s refund
    updatePickups(0.016);
    expect(G.levelT).toBe(0);
  });
});
