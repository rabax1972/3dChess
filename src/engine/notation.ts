import { FLAG_CASTLE, FLAG_EP, moveFlag, moveFrom, movePromo, moveTo, type Move } from './move';
import type { Position } from './position';
import { fileOf, levelOf, rankOf, toIndex, type PieceType } from './types';

/**
 * Notazione a tre componenti: <pezzo><colonna><traversa>.<livello>
 * Esempi: "Ca1.1 -> c2.2", "e2.1 -> e4.1", "Dd1.2 x d7.8+", "b7.1 -> b8.1=D".
 * Lettere italiane: R = Re, D = Donna (regina), T = Torre, A = Alfiere, C = Cavallo.
 */

export const FILES = 'abcdefgh';
export const PIECE_LETTERS: Record<PieceType, string> = { 1: '', 2: 'C', 3: 'A', 4: 'T', 5: 'D', 6: 'R' };
export const PIECE_NAMES: Record<PieceType, string> = {
  1: 'Pedone',
  2: 'Cavallo',
  3: 'Alfiere',
  4: 'Torre',
  5: 'Regina',
  6: 'Re',
};

export const squareName = (s: number): string => `${FILES[fileOf(s)]}${rankOf(s) + 1}.${levelOf(s) + 1}`;

export function parseSquare(text: string): number {
  const m = /^([a-h])([1-8])\.([1-8])$/.exec(text.trim());
  if (!m) throw new Error(`Casella non valida: ${text}`);
  return toIndex(FILES.indexOf(m[1]), Number(m[2]) - 1, Number(m[3]) - 1);
}

const letterToType = (l: string): PieceType | undefined => {
  const entry = Object.entries(PIECE_LETTERS).find(([, v]) => v === l);
  return entry ? (Number(entry[0]) as PieceType) : undefined;
};

/** Notazione della mossa `m`, da calcolare PRIMA di giocarla su `pos`. */
export function moveToNotation(pos: Position, m: Move): string {
  const from = moveFrom(m), to = moveTo(m), flag = moveFlag(m), promo = movePromo(m);
  const type = Math.abs(pos.board[from]) as PieceType;
  const capture = pos.board[to] !== 0 || flag === FLAG_EP;
  let text = `${PIECE_LETTERS[type]}${squareName(from)} ${capture ? 'x' : '->'} ${squareName(to)}`;
  if (promo) text += `=${PIECE_LETTERS[promo]}`;
  if (flag === FLAG_EP) text += ' e.p.';
  if (flag === FLAG_CASTLE) text += fileOf(to) > fileOf(from) ? ' (O-O)' : ' (O-O-O)';
  pos.makeMove(m);
  if (pos.inCheck()) text += pos.hasLegalMove() ? '+' : '#';
  pos.unmakeMove();
  return text;
}

/**
 * Trova la mossa legale corrispondente a una stringa in notazione (lettera del pezzo
 * facoltativa, "->" / "x" / "-" equivalenti, suffissi +/# ignorati).
 */
export function parseMove(pos: Position, text: string): Move | undefined {
  const m = /^([RDTAC]?)([a-h][1-8]\.[1-8])\s*(?:->|x|-)\s*([a-h][1-8]\.[1-8])(?:=([DTAC]))?/.exec(text.trim());
  if (!m) throw new Error(`Mossa non valida: ${text}`);
  const from = parseSquare(m[2]), to = parseSquare(m[3]);
  const promo = m[4] ? letterToType(m[4]) : undefined;
  const legal = pos.legalMoves().filter((mv) => moveFrom(mv) === from && moveTo(mv) === to);
  if (legal.length === 0) return undefined;
  if (promo !== undefined) return legal.find((mv) => movePromo(mv) === promo);
  return legal.find((mv) => movePromo(mv) === 0) ?? legal[0];
}
