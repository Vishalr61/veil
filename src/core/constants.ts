/* Fixed gameplay + render constants (the dynamic layout lives in legacy.js). */
export const EMPTY = 0, FILLED = 1, TRAIL = 2;
export const COMBO_WINDOW = 4.5; // seconds to chain a capture

// DPR-aware render scale, capped at 2 to bound fill-rate on high-DPR phones.
export const SS = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
