import { BISHOP_DIRS, DIR_COUNT, KING_TARGETS, KNIGHT_TARGETS, QUEEN_DIRS, RAYS, ROOK_DIRS } from '../directions';
import type { Position } from '../position';
import { BISHOP, CELLS, KING, KNIGHT, PAWN, QUEEN, ROOK, SIZE, WHITE, fileOf, levelOf, rankOf } from '../types';

/**
 * Valutazione statica = materiale + mobilità + controllo del centro del cubo.
 * Restituisce il punteggio in centipedoni dal punto di vista del giocatore di turno.
 */

/** Valori dei pezzi. In 3D i pezzi a lungo raggio valgono relativamente di più. */
export const PIECE_VALUES = [0, 100, 330, 360, 520, 1150, 0];

/** Peso della mobilità (centipedoni per casella raggiungibile), per tipo di pezzo. */
const MOBILITY_WEIGHT = [0, 0, 3, 2, 2, 1, 0];
/** Peso del bonus di centralità, per tipo di pezzo (il re preferisce stare lontano dal centro). */
const CENTER_WEIGHT = [0, 6, 14, 10, 4, 6, -6];
/** Bonus per traversa avanzata dei pedoni. */
const PAWN_ADVANCE = 6;

const HALF = (SIZE - 1) / 2;
const MAX_DIST = HALF * 3;
/** CENTER[s] ∈ [0, 1]: 1 al centro del cubo, 0 negli angoli (distanza di Manhattan). */
export const CENTER = Float32Array.from({ length: CELLS }, (_, s) => {
  const d = Math.abs(fileOf(s) - HALF) + Math.abs(rankOf(s) - HALF) + Math.abs(levelOf(s) - HALF);
  return 1 - d / MAX_DIST;
});
/** Bonus massimo di centralità (centipedoni) per tipo, già scalato. */
const CENTER_BONUS = Float32Array.from(CENTER_WEIGHT, (w) => w * 2);

function sliderMobility(board: Int8Array, s: number, dirs: readonly number[], color: number): number {
  let n = 0;
  const base = s * DIR_COUNT;
  for (let di = 0; di < dirs.length; di++) {
    const ray = RAYS[base + dirs[di]];
    for (let i = 0; i < ray.length; i++) {
      const q = board[ray[i]];
      if (q === 0) {
        n++;
        continue;
      }
      if (q * color < 0) n++;
      break;
    }
  }
  return n;
}

function leaperMobility(board: Int8Array, targets: Int16Array, color: number): number {
  let n = 0;
  for (let i = 0; i < targets.length; i++) if (board[targets[i]] * color <= 0) n++;
  return n;
}

export function evaluate(pos: Position): number {
  const b = pos.board;
  const list = pos.pieceList;
  let score = 0;
  for (let i = 0; i < pos.pieceCount; i++) {
    const s = list[i];
    const p = b[s];
    const color = p > 0 ? 1 : -1;
    const t = p * color;
    let v = PIECE_VALUES[t] + CENTER[s] * CENTER_BONUS[t];
    switch (t) {
      case PAWN: {
        const advanced = color === WHITE ? rankOf(s) - 1 : SIZE - 2 - rankOf(s);
        v += advanced * PAWN_ADVANCE;
        break;
      }
      case KNIGHT:
        v += leaperMobility(b, KNIGHT_TARGETS[s], color) * MOBILITY_WEIGHT[t];
        break;
      case BISHOP:
        v += sliderMobility(b, s, BISHOP_DIRS, color) * MOBILITY_WEIGHT[t];
        break;
      case ROOK:
        v += sliderMobility(b, s, ROOK_DIRS, color) * MOBILITY_WEIGHT[t];
        break;
      case QUEEN:
        v += sliderMobility(b, s, QUEEN_DIRS, color) * MOBILITY_WEIGHT[t];
        break;
      case KING:
        v += leaperMobility(b, KING_TARGETS[s], color) * MOBILITY_WEIGHT[t];
        break;
    }
    score += v * color;
  }
  return Math.round(score) * pos.side;
}
