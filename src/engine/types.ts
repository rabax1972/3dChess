/**
 * Tipi e costanti di base del motore. Nessuna dipendenza da DOM o Three.js.
 *
 * Coordinate: x = colonna (a-h), y = traversa (1-8), z = livello (1-8).
 * Internamente sono 0-based; l'indice di una cella è x + SIZE*y + SIZE²*z.
 */

export const SIZE = 8;
export const PLANE = SIZE * SIZE;
export const CELLS = SIZE * SIZE * SIZE;

export type Color = 1 | -1;
export const WHITE: Color = 1;
export const BLACK: Color = -1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export type PieceType = 1 | 2 | 3 | 4 | 5 | 6;

/** Pezzi a cui un pedone può essere promosso, in ordine di preferenza. */
export const PROMOTION_PIECES: readonly PieceType[] = [QUEEN, ROOK, BISHOP, KNIGHT];

/** Un pezzo sulla scacchiera è codificato come colore * tipo (0 = vuoto). */
export type Piece = number;

export const pieceColor = (p: Piece): Color => (p > 0 ? WHITE : BLACK);
export const pieceType = (p: Piece): PieceType => Math.abs(p) as PieceType;
export const makePiece = (type: PieceType, color: Color): Piece => type * color;

export const toIndex = (x: number, y: number, z: number): number => x + SIZE * y + PLANE * z;
export const fileOf = (s: number): number => s % SIZE;
export const rankOf = (s: number): number => Math.floor(s / SIZE) % SIZE;
export const levelOf = (s: number): number => Math.floor(s / PLANE);
export const inBounds = (x: number, y: number, z: number): boolean =>
  x >= 0 && x < SIZE && y >= 0 && y < SIZE && z >= 0 && z < SIZE;

/** Indice compatto del colore (0 = bianco, 1 = nero) per gli array per-colore. */
export const colorIndex = (c: Color): 0 | 1 => (c === WHITE ? 0 : 1);

/** Direzione di avanzamento dei pedoni lungo l'asse y. */
export const pawnDirection = (c: Color): number => c;
/** Traversa di promozione (0-based). */
export const promotionRank = (c: Color): number => (c === WHITE ? SIZE - 1 : 0);

/** Collocazione di un pezzo, usata dagli schieramenti e dai test. Coordinate 0-based. */
export interface Placement {
  type: PieceType;
  color: Color;
  x: number;
  y: number;
  z: number;
  /** true se il pezzo si è già mosso (niente arrocco / doppio passo). Default false. */
  moved?: boolean;
}

export type GameState = 'ongoing' | 'checkmate' | 'stalemate' | 'draw';
export type DrawReason = 'fifty-move' | 'repetition' | 'insufficient-material';

export interface GameStatus {
  state: GameState;
  winner?: Color;
  reason?: DrawReason;
  inCheck: boolean;
}
