import { SIZE, fileOf, levelOf, rankOf } from '../engine/types';

/**
 * Corrispondenza tra coordinate della scacchiera e spazio 3D.
 *   colonna x -> asse X del mondo (a a sinistra, h a destra visto dal Bianco)
 *   traversa y -> asse -Z del mondo (si allontana dal Bianco)
 *   livello z -> asse Y del mondo (verso l'alto)
 * I livelli sono più distanziati delle celle per lasciare spazio ai pezzi.
 */
export const CELL = 1;
export const LEVEL_SPACING = 1.45;
export const TILE_SIZE = 0.94;
export const TILE_THICKNESS = 0.03;

const HALF = (SIZE - 1) / 2;

export const worldX = (x: number) => (x - HALF) * CELL;
export const worldZ = (y: number) => -(y - HALF) * CELL;
/** Quota del piano (pavimento) del livello z. */
export const levelFloor = (z: number) => (z - HALF) * LEVEL_SPACING - LEVEL_SPACING * 0.35;

/** Posizione del pavimento della cella (dove poggia il pezzo). */
export function cellFloor(s: number): [number, number, number] {
  return [worldX(fileOf(s)), levelFloor(levelOf(s)), worldZ(rankOf(s))];
}

export const BOARD_EXTENT = SIZE * CELL;
export const CUBE_HEIGHT = SIZE * LEVEL_SPACING;
