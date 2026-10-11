import type { PieceType } from './types';

/**
 * Una mossa è codificata in un intero:
 *   bit 0-8   casella di partenza
 *   bit 9-17  casella di arrivo
 *   bit 18-20 pezzo di promozione (0 = nessuno)
 *   bit 21-22 flag (normale, doppio passo, en passant, arrocco)
 * Gli interi evitano allocazioni nel generatore e nella ricerca dell'IA.
 */
export type Move = number;

export const FLAG_NONE = 0;
export const FLAG_DOUBLE = 1;
export const FLAG_EP = 2;
export const FLAG_CASTLE = 3;

const SQ_BITS = 9;
const SQ_MASK = (1 << SQ_BITS) - 1;
const TO_SHIFT = SQ_BITS;
const PROMO_SHIFT = SQ_BITS * 2;
const FLAG_SHIFT = PROMO_SHIFT + 3;

export const encodeMove = (from: number, to: number, promo = 0, flag = FLAG_NONE): Move =>
  from | (to << TO_SHIFT) | (promo << PROMO_SHIFT) | (flag << FLAG_SHIFT);

export const moveFrom = (m: Move): number => m & SQ_MASK;
export const moveTo = (m: Move): number => (m >> TO_SHIFT) & SQ_MASK;
export const movePromo = (m: Move): PieceType | 0 => ((m >> PROMO_SHIFT) & 7) as PieceType | 0;
export const moveFlag = (m: Move): number => (m >> FLAG_SHIFT) & 3;
