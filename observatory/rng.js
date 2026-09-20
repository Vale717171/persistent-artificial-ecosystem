/**
 * Deterministic RNG helpers for the 3D observatory.
 *
 * The observatory never modifies the committed world state: it dramatizes it.
 * All client-side "life" uses its own deterministic generators so that the
 * same world snapshot always produces the same cast of characters.
 */

/** mulberry32 — small, fast, seedable PRNG. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string — used to derive per-object seeds. */
export function hashString(value) {
  let h = 2166136261 >>> 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rngFrom(...parts) {
  return makeRng(hashString(parts.join("|")));
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function chance(rng, probability) {
  return rng() < probability;
}
