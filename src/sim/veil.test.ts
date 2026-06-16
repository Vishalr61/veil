import { describe, it, expect } from 'vitest';
import { SeededRng } from '../core/rng';
import {
  genVeilBoard, VEIL_NONE, VEIL_CACHE, VEIL_HAZARD, veilCacheCount, veilHazardCount,
} from './veil';

const params = (level: number, isOpen: (i: number) => boolean = () => true) => ({
  cols: 10, rows: 10, level, isOpen,
});

describe('genVeilBoard', () => {
  it('same seed -> identical board', () => {
    const a = genVeilBoard(new SeededRng(42), params(5));
    const b = genVeilBoard(new SeededRng(42), params(5));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('places the expected cache/hazard counts', () => {
    const lvl = 6;
    const board = genVeilBoard(new SeededRng(1), params(lvl));
    expect(board.filter((v) => v === VEIL_CACHE).length).toBe(veilCacheCount(lvl));
    expect(board.filter((v) => v === VEIL_HAZARD).length).toBe(veilHazardCount(lvl));
  });

  it('never doubles up content on a cell', () => {
    const board = genVeilBoard(new SeededRng(7), params(9));
    for (const v of board) expect([VEIL_NONE, VEIL_CACHE, VEIL_HAZARD]).toContain(v);
  });

  it('levels 1-2 have no rifts, level 3 introduces them', () => {
    expect(veilHazardCount(1)).toBe(0);
    expect(veilHazardCount(2)).toBe(0);
    expect(veilHazardCount(3)).toBeGreaterThan(0);
  });

  it('only places on open cells', () => {
    const board = genVeilBoard(new SeededRng(3), params(9, (i) => i < 50));
    for (let i = 50; i < 100; i++) expect(board[i]).toBe(VEIL_NONE);
  });
});
