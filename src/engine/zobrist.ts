import { CELLS } from './types';

/**
 * Chiavi Zobrist a 53 bit (21 alti + 32 bassi) per riconoscere le posizioni ripetute
 * e per la tabella di trasposizione dell'IA. Generatore deterministico (mulberry32).
 */

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const rand = mulberry32(0x3dc4e55);
const HI_MASK = 0x1fffff;
const PIECE_KINDS = 13; // codici pezzo da -6 a +6

const fill = (n: number, mask = 0xffffffff) => {
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) a[i] = rand() & mask;
  return a;
};

export const Z_PIECE_HI = fill(PIECE_KINDS * CELLS, HI_MASK);
export const Z_PIECE_LO = fill(PIECE_KINDS * CELLS);
export const Z_VIRGIN_HI = fill(CELLS, HI_MASK);
export const Z_VIRGIN_LO = fill(CELLS);
export const Z_EP_HI = fill(CELLS, HI_MASK);
export const Z_EP_LO = fill(CELLS);
/** Casella del pedone catturabile en passant (dopo un doppio passo lungo y o lungo z). */
export const Z_EPV_HI = fill(CELLS, HI_MASK);
export const Z_EPV_LO = fill(CELLS);
export const Z_SIDE_HI = rand() & HI_MASK;
export const Z_SIDE_LO = rand() | 0;

export const pieceKey = (piece: number, sq: number) => (piece + 6) * CELLS + sq;
export const combineKey = (hi: number, lo: number) => hi * 4294967296 + (lo >>> 0);
