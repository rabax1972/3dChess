import {
  BLACK,
  CELLS,
  SIZE,
  WHITE,
  colorIndex,
  fileOf,
  inBounds,
  levelOf,
  pawnDirection,
  rankOf,
  toIndex,
} from './types';

/**
 * Tabelle precalcolate per il cubo 8x8x8: direzioni di scorrimento, raggi,
 * salti del cavallo, caselle adiacenti del re e catture dei pedoni.
 * Calcolarle una volta sola rende il generatore di mosse veloce anche su 512 celle.
 */

export const DIR_AXIS = 1; // cambia 1 coordinata: torre
export const DIR_PLANAR = 2; // cambia 2 coordinate: alfiere
export const DIR_TRIAGONAL = 3; // cambia 3 coordinate: solo regina

export interface Direction {
  dx: number;
  dy: number;
  dz: number;
  kind: number;
}

/** Le 26 direzioni verso le celle adiacenti, ordinate per tipo. */
export const DIRECTIONS: readonly Direction[] = (() => {
  const dirs: Direction[] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const kind = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        if (kind > 0) dirs.push({ dx, dy, dz, kind });
      }
  return dirs.sort((a, b) => a.kind - b.kind);
})();

export const DIR_COUNT = DIRECTIONS.length; // 26
const dirsOfKind = (...kinds: number[]) =>
  DIRECTIONS.map((d, i) => (kinds.includes(d.kind) ? i : -1)).filter((i) => i >= 0);

export const ROOK_DIRS = dirsOfKind(DIR_AXIS); // 6
export const BISHOP_DIRS = dirsOfKind(DIR_PLANAR); // 12
export const QUEEN_DIRS = dirsOfKind(DIR_AXIS, DIR_PLANAR, DIR_TRIAGONAL); // 26
export const DIR_KIND = Int8Array.from(DIRECTIONS.map((d) => d.kind));

/** Spostamenti del cavallo: (±2, ±1, 0) in ogni permutazione degli assi = 24. */
export const KNIGHT_OFFSETS: readonly [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) {
      if (a === b) continue;
      for (const sa of [-2, 2])
        for (const sb of [-1, 1]) {
          const v: [number, number, number] = [0, 0, 0];
          v[a] = sa;
          v[b] = sb;
          out.push(v);
        }
    }
  return out;
})();

/** Catture del pedone: avanti in y combinato con x±1 oppure z±1. */
const PAWN_CAPTURE_SIDESTEPS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** RAYS[s * DIR_COUNT + d] = caselle incontrate partendo da s lungo la direzione d. */
export const RAYS: Int16Array[] = new Array(CELLS * DIR_COUNT);
export const KNIGHT_TARGETS: Int16Array[] = new Array(CELLS);
export const KING_TARGETS: Int16Array[] = new Array(CELLS);
/** PAWN_CAPTURES[colorIndex][s] = caselle catturabili da un pedone di quel colore in s. */
export const PAWN_CAPTURES: [Int16Array[], Int16Array[]] = [new Array(CELLS), new Array(CELLS)];

for (let s = 0; s < CELLS; s++) {
  const x = fileOf(s), y = rankOf(s), z = levelOf(s);
  const offsetTargets = (offsets: readonly (readonly [number, number, number])[]) =>
    Int16Array.from(
      offsets
        .filter(([dx, dy, dz]) => inBounds(x + dx, y + dy, z + dz))
        .map(([dx, dy, dz]) => toIndex(x + dx, y + dy, z + dz)),
    );

  DIRECTIONS.forEach((d, i) => {
    const ray: number[] = [];
    for (let k = 1; k < SIZE; k++) {
      const nx = x + d.dx * k, ny = y + d.dy * k, nz = z + d.dz * k;
      if (!inBounds(nx, ny, nz)) break;
      ray.push(toIndex(nx, ny, nz));
    }
    RAYS[s * DIR_COUNT + i] = Int16Array.from(ray);
  });
  KING_TARGETS[s] = offsetTargets(DIRECTIONS.map((d) => [d.dx, d.dy, d.dz] as const));
  KNIGHT_TARGETS[s] = offsetTargets(KNIGHT_OFFSETS);
  for (const c of [WHITE, BLACK]) {
    const dy = pawnDirection(c);
    PAWN_CAPTURES[colorIndex(c)][s] = offsetTargets(PAWN_CAPTURE_SIDESTEPS.map(([dx, dz]) => [dx, dy, dz] as const));
  }
}
